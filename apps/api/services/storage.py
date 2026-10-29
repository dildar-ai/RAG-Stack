import logging

from services.supabase_client import get_supabase_admin

BUCKET_NAME = "documents"
logger = logging.getLogger("rag.storage")


def doc_object_path(workspace_id: str, document_id: str) -> str:
    """Canonical storage layout: one folder per workspace, one file per document."""
    return f"{workspace_id}/{document_id}.pdf"


def upload_document_storage(workspace_id: str, document_id: str, file_bytes: bytes) -> str:
    path = doc_object_path(workspace_id, document_id)
    res = get_supabase_admin().storage.from_(BUCKET_NAME).upload(
        path,
        file_bytes,
        file_options={"content-type": "application/pdf", "upsert": "false"},
    )
    if not res:
        raise RuntimeError("Failed to store PDF file.")
    return path


def create_signed_url(path: str, expires_in: int = 900) -> str | None:
    """Short-lived signed URL for the private bucket (default 15 minutes)."""
    try:
        res = get_supabase_admin().storage.from_(BUCKET_NAME).create_signed_url(path, expires_in)
        return res.get("signedURL")
    except Exception as e:
        logger.warning("Signed URL creation failed for '%s': %s", path, e)
        return None


def delete_document_storage(path: str) -> None:
    try:
        get_supabase_admin().storage.from_(BUCKET_NAME).remove([path])
    except Exception as e:
        # Do not fail the whole delete flow on storage errors, but surface it in logs
        logger.warning("Failed to delete storage object '%s': %s", path, e)
