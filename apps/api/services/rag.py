"""
Core Retrieval-Augmented Generation pipeline.

Shared by the authenticated dashboard endpoint (/api/v1/chat) and the
public embeddable widget (/api/v1/widget/chat) so retrieval, prompt assembly
and generation behaviour stay identical across both surfaces.
"""
import logging
import os
import re
from typing import Any, Dict, List

from qdrant_client import QdrantClient
from qdrant_client.http.models import PayloadSchemaType
from langchain_groq import ChatGroq
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from services.embeddings import get_embedding
from services.storage import create_signed_url, doc_object_path
from services.supabase_client import get_supabase_admin

COLLECTION_NAME = "documents"
logger = logging.getLogger("rag.pipeline")

TOP_K = int(os.getenv("RAG_TOP_K", "6"))
# Over-fetch candidates so the score threshold can prune junk before prompting
CANDIDATE_LIMIT = max(TOP_K * 3, 12)
# MiniLM cosine similarity: >=0.35 clearly related, <0.05 mostly noise.
# Kept permissive because citation grounding already hides unused sources.
MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.10"))
MAX_CHUNK_CHARS = int(os.getenv("RAG_MAX_CHUNK_CHARS", "1200"))
MAX_HISTORY_TURNS = int(os.getenv("RAG_MAX_HISTORY_TURNS", "6"))
LLM_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

SYSTEM_PROMPT = """You are a helpful knowledge assistant for a document workspace.
Answer the user's question using ONLY the numbered blocks inside the <context> block.
Each block is labelled "[n] (page P)"; remember which page each fact came from.
- Cite every supported statement with the bare marker of the block(s) it came from, e.g. "...may lead to termination [2]." Never write the word "block", never put markers inside parentheses, and only use markers for blocks you actually relied on.
- Company names, people and roles often appear in titles, cover pages, running headers or short label lines (e.g. "Jane Doe" followed by "CEO"). Treat those as valid evidence; do not dismiss short blocks as irrelevant.
- If asked who owns, authored or published the document, the organization name in the header/title page IS the answer.
- For broad questions ("tell me about the company", "what is the X policy?"), give the concrete facts available (names, dates, places, roles), not just a list of job titles, and summarise across all relevant blocks instead of refusing.
- If the answer genuinely is not in the context, reply exactly: "I don't have enough information to answer that." and add no citations.
Never invent facts or reference blocks that are not present in the context."""

qdrant = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY"),
)

# Ensure payload indexes exist so filtering does not throw 400 Bad Request
# (document_id is required for delete-by-filter on Qdrant >=1.13)
for _field in ("workspace_id", "document_id"):
    try:
        qdrant.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name=_field,
            field_schema=PayloadSchemaType.KEYWORD,
        )
    except Exception:
        pass

llm = ChatGroq(
    temperature=0,
    model_name=LLM_MODEL,
    api_key=os.getenv("GROQ_API_KEY"),
)


def _compress_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# gpt-oss frequently emits fullwidth/CJK brackets and narrow no-break spaces
# around citation markers (e.g. \uff12\u202f). Without this normalization the
# [n] regex silently matches nothing and every answer falls back to the same
# top-scoring chips regardless of what was actually cited.
_OUTPUT_NORMALIZE = str.maketrans({
    "\u202f": " ", "\u00a0": " ", "\u2009": " ", "\u200a": " ",
    "\u2060": "", "\ufeff": "",
    "\uff3b": "[", "\uff3d": "]",
    "\u3010": "[", "\u3011": "]",
    "\uff08": "(", "\uff09": ")",
})

_MARKER_RE = re.compile(r"\[\s*(\d{1,2})\s*\]")


class RetrievalError(Exception):
    """Raised when vector search itself fails."""


class GenerationError(Exception):
    """Raised when the LLM call fails."""


def retrieve_and_answer(
    workspace_id: str,
    query: str,
    history: List[Dict[str, str]] | None = None,
    include_source_urls: bool = True,
) -> Dict[str, Any]:
    """
    Runs embed -> filter-by-workspace -> prompt -> generate.

    `include_source_urls` controls whether short-lived signed PDF URLs are
    attached to citations. The public widget disables this so anonymous
    visitors cannot pull the underlying documents unless the workspace owner
    explicitly allows source access.
    """
    try:
        query_vector = get_embedding(query)
    except Exception as e:
        raise RetrievalError(f"Error generating embeddings: {str(e)}")

    try:
        search_response = qdrant.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            query_filter={
                "must": [
                    {"key": "workspace_id", "match": {"value": workspace_id}}
                ]
            },
            limit=CANDIDATE_LIMIT,
        )
        hits = [h for h in search_response.points if (h.score or 0.0) >= MIN_SCORE][:TOP_K]
    except Exception as e:
        raise RetrievalError(f"Database search failed: {str(e)}")

    empty_result = {
        "answer": (
            "I don't have enough information in your Knowledge Base to answer that question. "
            "Please upload relevant documents first."
        ),
        "citations": [],
        "retrieved": 0,
    }
    if not hits:
        return empty_result

    # Resolve display filenames and signed source URLs for the cited documents
    cited_doc_ids = list({hit.payload["document_id"] for hit in hits})
    filename_by_doc_id: Dict[str, str] = {}
    signed_url_by_doc_id: Dict[str, str | None] = {}
    try:
        res = (
            get_supabase_admin()
            .table("documents")
            .select("id, filename, storage_path")
            .in_("id", cited_doc_ids)
            .eq("workspace_id", workspace_id)
            .execute()
        )
        for row in res.data:
            filename_by_doc_id[row["id"]] = row["filename"]
            if include_source_urls:
                path = row["storage_path"] or doc_object_path(workspace_id, row["id"])
                signed_url_by_doc_id[row["id"]] = create_signed_url(path)
    except Exception as e:
        # Citation metadata is a UX nicety; retrieval must still succeed
        logger.warning("Citation metadata resolution failed: %s", e)

    context_parts: List[str] = []
    citations: List[Dict[str, Any]] = []
    for idx, hit in enumerate(hits):
        payload = hit.payload
        raw_text = payload["text"]
        # Numbered AND page-labelled so the model anchors facts to real pages
        page_note = f" (page {payload['page']})"
        # Numbered so the model can point at exactly which blocks it used
        context_parts.append(f"[{idx + 1}]{page_note} {raw_text[:MAX_CHUNK_CHARS]}")
        citations.append({
            "document_id": payload["document_id"],
            "filename": filename_by_doc_id.get(payload["document_id"], "document.pdf"),
            "page": payload["page"],
            "bbox": payload["bbox"],
            # Chip/tooltip preview, not the raw block
            "text": _compress_whitespace(raw_text)[:280],
            "pdf_url": signed_url_by_doc_id.get(payload["document_id"]),
        })

    context_text = "\n\n---\n\n".join(context_parts)
    prompt_text = f"{SYSTEM_PROMPT}\n<context>\n{context_text}\n</context>"

    messages: List[BaseMessage] = [SystemMessage(content=prompt_text)]
    for msg in (history or [])[-MAX_HISTORY_TURNS:]:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        content = msg.get("content")
        if role not in ("user", "assistant") or not content:
            continue
        trimmed = _compress_whitespace(str(content))[:800]
        messages.append(HumanMessage(content=trimmed) if role == "user" else AIMessage(content=trimmed))
    messages.append(HumanMessage(content=query))

    try:
        response = llm.invoke(messages)
    except Exception as e:
        raise GenerationError(f"LLM generation failed: {str(e)}")

    answer = str(response.content).translate(_OUTPUT_NORMALIZE)
    answer = re.sub(r" {2,}", " ", answer).strip()

    # Ground the citation chips: keep only the sources the model actually cited,
    # then renumber the [n] markers in the answer so they map 1:1 to chip order.
    if "don't have enough information" in answer.lower():
        final_citations: List[Dict[str, Any]] = []
        answer = _MARKER_RE.sub("", answer)
    else:
        used = sorted({
            int(n) for n in _MARKER_RE.findall(answer)
            if 1 <= int(n) <= len(citations)
        })
        if used:
            remap = {old: new for new, old in enumerate(used, start=1)}
            final_citations = []
            for old_idx, citation in enumerate(citations, start=1):
                if old_idx in remap:
                    citation["marker"] = remap[old_idx]
                    final_citations.append(citation)

            def _renumber(m: re.Match) -> str:
                # Valid markers get their chip number; invented ones disappear
                n = int(m.group(1))
                return f"[{remap[n]}]" if n in remap else ""

            answer = _MARKER_RE.sub(_renumber, answer)
            answer = re.sub(r"([^\s\[(])\[(\d{1,2})\]", r"\1 [\2]", answer)
            answer = re.sub(r" {2,}", " ", answer).strip()
        else:
            # Model answered without markers: fall back to the strongest matches
            final_citations = citations[: min(2, len(citations))]
            for i, citation in enumerate(final_citations, start=1):
                citation["marker"] = i

    return {
        "answer": answer,
        "citations": final_citations,
        "retrieved": len(final_citations),
    }
