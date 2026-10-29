import logging
import os
import re
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct, VectorParams, Distance, PayloadSchemaType, Filter

from services.auth import ensure_workspace_ownership, verify_supabase_token
from services.embeddings import get_embeddings
from services.pdf_parser import PdfParseError, parse_pdf
from services.rate_limit import limit_upload
from services.storage import (
    upload_document_storage,
    delete_document_storage,
    doc_object_path,
    create_signed_url,
)
from services.supabase_client import get_supabase_admin

router = APIRouter()
logger = logging.getLogger("rag.upload")

qdrant = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY"),
)

COLLECTION_NAME = "documents"
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024

_collection_ready = False


def ensure_collection() -> bool:
    """
    Creates the collection and workspace_id payload index if needed.

    Runs lazily and never raises: a temporary Qdrant outage must not prevent
    the app from starting, and request handlers turn a False result into a 503.
    """
    global _collection_ready
    if _collection_ready:
        return True

    try:
        if not qdrant.collection_exists(COLLECTION_NAME):
            qdrant.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )
        # Payload indexes: workspace_id for fast filtered retrieval, document_id
        # because Qdrant >=1.13 rejects delete-by-filter on unindexed keys
        qdrant.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="workspace_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        qdrant.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="document_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        _collection_ready = True
    except Exception as e:
        logger.warning("Qdrant collection bootstrap failed: %s", e)

    return _collection_ready


# Attempt once at import time, but tolerate failure
ensure_collection()


def _document_filter(document_id: str) -> Filter:
    """Reusable selector that matches every vector point of a single document."""
    return Filter(must=[{"key": "document_id", "match": {"value": document_id}}])


def _upsert_batches(points: list[PointStruct]) -> None:
    """Blocking Qdrant upsert, executed in a worker thread."""
    batch_size = 100
    for i in range(0, len(points), batch_size):
        qdrant.upsert(
            collection_name=COLLECTION_NAME,
            points=points[i:i + batch_size],
        )


def _insert_document_record(record: dict) -> None:
    """Blocking Supabase insert, executed in a worker thread."""
    get_supabase_admin().table("documents").insert(record).execute()


def _delete_document_vectors(document_id: str) -> None:
    """Blocking Qdrant delete-by-filter, executed in a worker thread."""
    qdrant.delete(
        collection_name=COLLECTION_NAME,
        points_selector=_document_filter(document_id),
    )


def _lookup_document(workspace_id: str, document_id: str, columns: str) -> dict | None:
    """Blocking document lookup, executed in a worker thread."""
    res = (
        get_supabase_admin()
        .table("documents")
        .select(columns)
        .eq("id", document_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return res.data[0] if res.data else None


def _delete_document_record(document_id: str) -> None:
    """Blocking Supabase delete, executed in a worker thread."""
    get_supabase_admin().table("documents").delete().eq("id", document_id).execute()


def _cleanup_document(document_id: str, workspace_id: str, storage_path: str | None) -> None:
    """Best-effort compensation when a multi-step ingestion fails halfway."""
    try:
        _delete_document_vectors(document_id)
    except Exception as e:
        logger.warning("Compensation vector cleanup failed for %s: %s", document_id, e)
    if storage_path:
        delete_document_storage(storage_path)


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    workspace_id: str = "",
    user_id: str = Depends(verify_supabase_token),
):
    # 1. Tenant isolation: the caller must own the workspace
    await ensure_workspace_ownership(workspace_id, user_id)

    # Ingestion is expensive; cap how often one account can trigger it
    limit_upload(user_id)

    # Vector store must be reachable before we accept a document
    if not ensure_collection():
        raise HTTPException(
            status_code=503,
            detail="Vector store is temporarily unavailable. Please retry shortly.",
        )

    # 2. Validate content type and extension
    if file.content_type not in (None, "application/pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    filename = os.path.basename(file.filename or "document.pdf")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # 3. Read with a hard size cap (never trust Content-Length)
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.",
        )
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF.")

    # 4. Write to a fully generated temp path - original filename is NEVER used on disk
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename)[:100]
    fd, temp_path = tempfile.mkstemp(prefix=f"rag_{uuid.uuid4()}_", suffix=f"_{safe_name}.pdf")
    with os.fdopen(fd, "wb") as buffer:
        buffer.write(data)

    document_id = str(uuid.uuid4())
    storage_path = None

    try:
        # 5. Parse PDF into text blocks with page + bbox metadata (CPU bound)
        try:
            blocks = await run_in_threadpool(parse_pdf, temp_path)
        except PdfParseError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if not blocks:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from the PDF. Scanned/image-only documents require OCR.",
            )

        # 6. Embed all blocks in one batched pass (CPU bound, off the event loop)
        try:
            vectors = await run_in_threadpool(get_embeddings, [block["text"] for block in blocks])
        except Exception as e:
            logger.error("Embedding failure for doc %s: %s", document_id, e)
            raise HTTPException(status_code=500, detail="Embedding generation failed. Please retry.")

        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "workspace_id": workspace_id,
                    "document_id": document_id,
                    "page": block["page"],
                    "bbox": block["bbox"],
                    "text": block["text"],
                },
            )
            for block, vector in zip(blocks, vectors)
        ]

        # 7. Upsert vectors in batches of 100
        try:
            await run_in_threadpool(_upsert_batches, points)
        except Exception as e:
            logger.error("Qdrant upsert failed for doc %s: %s", document_id, e)
            _cleanup_document(document_id, workspace_id, None)
            raise HTTPException(status_code=500, detail="Vector indexing failed. Please retry.")

        # 8. Store the raw PDF in the (now private) Supabase bucket
        try:
            storage_path = await run_in_threadpool(
                upload_document_storage, workspace_id, document_id, data
            )
        except Exception as e:
            logger.error("Storage upload failed for doc %s: %s", document_id, e)
            _cleanup_document(document_id, workspace_id, None)
            raise HTTPException(status_code=500, detail="File storage failed. Please retry.")

        # 9. Register the document record (service-role insert; owner verified above)
        try:
            await run_in_threadpool(_insert_document_record, {
                "id": document_id,
                "workspace_id": workspace_id,
                "filename": filename,
                "storage_path": storage_path,
                "status": "Processed",
            })
        except Exception as e:
            logger.error("Document record insert failed for doc %s: %s", document_id, e)
            _cleanup_document(document_id, workspace_id, storage_path)
            raise HTTPException(status_code=500, detail="Database insertion failed. Please retry.")

        logger.info("Ingested doc %s (%s chunks) for workspace %s", document_id, len(points), workspace_id)

        return {
            "status": "success",
            "document_id": document_id,
            "chunks_processed": len(points),
            "filename": filename,
        }

    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)


class DeleteRequest(BaseModel):
    workspace_id: str
    document_id: str


class DocumentUrlRequest(BaseModel):
    workspace_id: str
    document_id: str


@router.post("/documents/url")
async def get_document_url(
    request: DocumentUrlRequest,
    user_id: str = Depends(verify_supabase_token),
):
    """
    Returns a short-lived signed URL for a stored PDF.
    Used by the citation viewer so historic citations still resolve correctly.
    """
    await ensure_workspace_ownership(request.workspace_id, user_id)

    doc = await run_in_threadpool(
        _lookup_document, request.workspace_id, request.document_id, "storage_path, filename"
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found in this workspace.")

    path = doc["storage_path"] or doc_object_path(request.workspace_id, request.document_id)
    url = await run_in_threadpool(create_signed_url, path)
    if not url:
        raise HTTPException(status_code=404, detail="The source PDF file is no longer available.")

    return {"url": url, "filename": doc["filename"]}


@router.post("/documents/delete")
async def delete_document(
    request: DeleteRequest,
    user_id: str = Depends(verify_supabase_token),
):
    # 1. Tenant isolation
    await ensure_workspace_ownership(request.workspace_id, user_id)

    doc = await run_in_threadpool(
        _lookup_document, request.workspace_id, request.document_id, "storage_path"
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found in this workspace.")

    # 2. Delete vectors from Qdrant
    try:
        await run_in_threadpool(_delete_document_vectors, request.document_id)
    except Exception as e:
        logger.error("Vector delete failed for doc %s: %s", request.document_id, e)
        raise HTTPException(status_code=500, detail="Failed to delete vectors. Please retry.")

    # 3. Delete the raw PDF from storage
    await run_in_threadpool(delete_document_storage, doc["storage_path"] or doc_object_path(
        request.workspace_id, request.document_id
    ))

    # 4. Delete the DB row
    await run_in_threadpool(_delete_document_record, request.document_id)

    logger.info("Deleted doc %s from workspace %s", request.document_id, request.workspace_id)
    return {"status": "deleted", "document_id": request.document_id}
