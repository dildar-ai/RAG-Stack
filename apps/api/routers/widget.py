"""
Public chat widget endpoints.

These are reachable by anonymous visitors on a customer's website, so access
is granted by a workspace-scoped *publishable key* instead of a user session.
The key only allows querying that one workspace's knowledge base - it can
never read, upload or delete documents.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from services.observability import sanitize_upstream_error
from services.rate_limit import limit_widget
from services.rag import GenerationError, RetrievalError, retrieve_and_answer
from services.supabase_client import get_supabase_admin

router = APIRouter()

PUBLISHABLE_KEY_HEADER = "X-Publishable-Key"


class WidgetChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    history: List[Dict[str, str]] = Field(default_factory=list)


class Citation(BaseModel):
    document_id: str
    filename: str
    page: int
    bbox: List[float]
    text: str
    pdf_url: Optional[str] = None
    # Position of this source's [n] marker inside the answer text
    marker: Optional[int] = None


class WidgetChatResponse(BaseModel):
    answer: str
    citations: List[Citation]


class WidgetConfig(BaseModel):
    workspace_name: str
    welcome_message: str
    allow_source_access: bool


def _fetch_widget_row(publishable_key: str) -> Dict[str, Any]:
    res = (
        get_supabase_admin()
        .table("widget_settings")
        .select(
            "workspace_id, is_enabled, allow_source_access, welcome_message, "
            "allowed_origins, workspaces(name)"
        )
        .eq("publishable_key", publishable_key)
        .execute()
    )
    return res.data[0] if res.data else None


def _resolve_widget_config(publishable_key: str) -> Dict[str, Any]:
    """Looks up the widget row for a publishable key. Raises 401/403 on failure."""
    if not publishable_key:
        raise HTTPException(status_code=401, detail="Missing publishable key.")

    try:
        row = _fetch_widget_row(publishable_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=sanitize_upstream_error(e))

    if not row:
        raise HTTPException(status_code=401, detail="Unknown publishable key.")
    if not row.get("is_enabled"):
        raise HTTPException(status_code=403, detail="This chat widget is disabled.")

    return row


def _enforce_origin_policy(row: Dict[str, Any], request: Request) -> None:
    """
    When the workspace restricted the widget to specific domains, reject calls
    whose browser Origin is not on that list. Direct curl/script calls carry no
    Origin header and are still allowed for the owner's own integrations.
    """
    allowed = [o for o in (row.get("allowed_origins") or []) if o]
    if not allowed:
        return

    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in [a.rstrip("/") for a in allowed]:
        raise HTTPException(status_code=403, detail="Origin not allowed for this widget.")


async def widget_context(
    request: Request,
    publishable_key: str | None = Header(default=None, alias=PUBLISHABLE_KEY_HEADER),
) -> Dict[str, Any]:
    row = await run_in_threadpool(_resolve_widget_config, publishable_key or "")
    _enforce_origin_policy(row, request)
    return row


@router.get("/widget/config", response_model=WidgetConfig)
async def widget_config(row: Dict[str, Any] = Depends(widget_context)):
    """Returns the widget's presentation settings for the embed script."""
    workspace = row.get("workspaces") or {}
    name = workspace.get("name") if isinstance(workspace, dict) else None
    return WidgetConfig(
        workspace_name=name or "Support Assistant",
        welcome_message=row.get("welcome_message") or "Ask me anything about our documents.",
        allow_source_access=bool(row.get("allow_source_access")),
    )


@router.post("/widget/chat", response_model=WidgetChatResponse)
async def widget_chat(
    request: Request,
    chat_request: WidgetChatRequest,
    row: Dict[str, Any] = Depends(widget_context),
):
    workspace_id = row["workspace_id"]

    # Anonymous endpoint: throttle per workspace + client IP
    limit_widget(workspace_id, request)

    try:
        result: Dict[str, Any] = await run_in_threadpool(
            retrieve_and_answer,
            workspace_id=workspace_id,
            query=chat_request.query,
            history=chat_request.history,
            include_source_urls=bool(row.get("allow_source_access")),
        )
    except RetrievalError as e:
        raise HTTPException(status_code=500, detail=sanitize_upstream_error(e))
    except GenerationError as e:
        raise HTTPException(status_code=502, detail=sanitize_upstream_error(e))

    return WidgetChatResponse(answer=result["answer"], citations=result["citations"])
