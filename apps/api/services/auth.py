import os
import time
from typing import Tuple

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from services.supabase_client import get_supabase_admin

bearer_scheme = HTTPBearer(auto_error=False)

# Very small in-memory cache so we don't call /auth/v1/user on every request
_token_cache: dict[str, Tuple[str, float]] = {}
_TOKEN_TTL_SECONDS = 60
_CACHE_MAX_ENTRIES = 1000


def _cleanup_cache() -> None:
    """Drop expired entries and cap total memory usage."""
    now = time.time()
    expired = [t for t, (_, exp) in _token_cache.items() if exp <= now]
    for t in expired:
        _token_cache.pop(t, None)
    if len(_token_cache) > _CACHE_MAX_ENTRIES:
        for t in sorted(_token_cache, key=lambda k: _token_cache[k][1])[
            : len(_token_cache) - _CACHE_MAX_ENTRIES
        ]:
            _token_cache.pop(t, None)


async def verify_supabase_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """
    Validates the Supabase access token against the project's Auth server
    (works for every signing algorithm, including future key rotations)
    and returns the authenticated user id.
    """
    if credentials is None or (credentials.scheme and credentials.scheme.lower() != "bearer"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Provide a Bearer access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    cached = _token_cache.get(token)
    if cached and cached[1] > time.time():
        return cached[0]

    url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not anon_key:
        raise HTTPException(status_code=500, detail="Supabase auth is not configured on the API server.")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{url.rstrip('/')}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": anon_key,
                },
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Auth service unreachable: {str(e)}")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = resp.json()["id"]
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Malformed auth response from Supabase.")

    _cleanup_cache()
    _token_cache[token] = (user_id, time.time() + _TOKEN_TTL_SECONDS)
    return user_id


def _workspace_owned(workspace_id: str, user_id: str) -> bool:
    """Blocking ownership lookup, executed in a worker thread."""
    res = (
        get_supabase_admin()
        .table("workspaces")
        .select("id")
        .eq("id", workspace_id)
        .eq("owner_id", user_id)
        .execute()
    )
    return bool(res.data)


async def ensure_workspace_ownership(workspace_id: str, user_id: str) -> None:
    """
    Raises a 400/403 unless the authenticated user owns the workspace.
    Called explicitly at the start of every endpoint that touches tenant data.
    """
    import uuid as uuid_lib

    try:
        uuid_lib.UUID(workspace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="workspace_id must be a valid UUID.")

    # Supabase call is blocking; keep the event loop free for concurrent requests
    owned = await run_in_threadpool(_workspace_owned, workspace_id, user_id)
    if not owned:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this workspace.",
        )
