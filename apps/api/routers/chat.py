from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from services.auth import ensure_workspace_ownership, verify_supabase_token
from services.observability import sanitize_upstream_error
from services.rate_limit import limit_chat
from services.rag import GenerationError, RetrievalError, retrieve_and_answer

router = APIRouter()


class ChatRequest(BaseModel):
    workspace_id: str
    query: str = Field(..., min_length=1, max_length=4000)
    history: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Optional prior turns as [{role: 'user'|'assistant', content: str}]",
    )


class Citation(BaseModel):
    document_id: str
    filename: str
    page: int
    bbox: List[float]
    text: str
    pdf_url: Optional[str] = None
    # Position of this source's [n] marker inside the answer text
    marker: Optional[int] = None


class ChatResponse(BaseModel):
    answer: str
    citations: List[Citation]


@router.post("/chat", response_model=ChatResponse)
async def chat_with_bot(request: ChatRequest, user_id: str = Depends(verify_supabase_token)):
    # 1. Tenant isolation before any retrieval happens
    await ensure_workspace_ownership(request.workspace_id, user_id)

    # 2. Guard against runaway LLM cost from a single account
    limit_chat(user_id)

    # 3. Retrieval + generation is blocking work, so run it off the event loop
    try:
        result: Dict[str, Any] = await run_in_threadpool(
            retrieve_and_answer,
            workspace_id=request.workspace_id,
            query=request.query,
            history=request.history,
            include_source_urls=True,
        )
    except RetrievalError as e:
        raise HTTPException(status_code=500, detail=sanitize_upstream_error(e))
    except GenerationError as e:
        raise HTTPException(status_code=502, detail=sanitize_upstream_error(e))

    return ChatResponse(answer=result["answer"], citations=result["citations"])
