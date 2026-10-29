import os
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request, status

# Sliding-window in-memory rate limiter.
# Good enough for a single API replica; use Redis when scaling horizontally.
_request_log: Dict[str, Deque[float]] = defaultdict(deque)

CHAT_RPM = int(os.getenv("RATE_LIMIT_CHAT_RPM", "30"))        # per authenticated user
WIDGET_RPM = int(os.getenv("RATE_LIMIT_WIDGET_RPM", "20"))   # per workspace publishable key
UPLOAD_RPM = int(os.getenv("RATE_LIMIT_UPLOAD_RPM", "10"))   # per authenticated user

_WINDOW_SECONDS = 60
_MAX_TRACKED_KEYS = 10_000


def enforce_rate_limit(bucket: str, identity: str, max_requests: int) -> None:
    """
    Raises HTTP 429 when `identity` exceeds `max_requests` in the rolling minute.
    """
    key = f"{bucket}:{identity}"
    now = time.monotonic()
    hits = _request_log[key]

    while hits and now - hits[0] > _WINDOW_SECONDS:
        hits.popleft()

    # Keep memory bounded when many distinct clients appear
    if len(_request_log) > _MAX_TRACKED_KEYS:
        stale = [k for k, v in _request_log.items() if not v or now - v[-1] > _WINDOW_SECONDS]
        for k in stale:
            _request_log.pop(k, None)

    if len(hits) >= max_requests:
        retry_after = int(_WINDOW_SECONDS - (now - hits[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    hits.append(now)


def limit_chat(user_id: str) -> None:
    enforce_rate_limit("chat", user_id, CHAT_RPM)


def limit_upload(user_id: str) -> None:
    enforce_rate_limit("upload", user_id, UPLOAD_RPM)


def limit_widget(workspace_id: str, request: Request) -> None:
    """
    Widgets are anonymous, so the key is workspace id + client IP.
    IP comes from the first X-Forwarded-For entry (set by Vercel / HF proxy).
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    first_forwarded = forwarded.split(",")[0].strip()
    client_ip = first_forwarded or (request.client.host if request.client else "unknown")
    enforce_rate_limit("widget", f"{workspace_id}:{client_ip}", WIDGET_RPM)
