"""
Production observability: structured logs, request IDs, access logging
and safe error responses.

Log lines carry a request id so a single browser request can be traced
across FastAPI -> Qdrant/Supabase/Groq failures in centralized logging.
"""
import logging
import os
import time
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

# Per-request id, bound by the middleware and read by the log filter
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_access_logger = logging.getLogger("rag.access")
_app_logger = logging.getLogger("rag.app")

# Fields that must never appear in logs, even inside exception messages
_REDACTED = ("api_key", "token", "authorization", "secret")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def setup_logging() -> None:
    """Configure root logging once, before any router imports run."""
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s [%(name)s] req=%(request_id)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    handler.addFilter(_RequestIdFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Tame noisy third-party loggers; our own modules stay at INFO
    for noisy in ("httpx", "urllib3", "sentence_transformers", "qdrant_client"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def _redact_if_sensitive(detail: str) -> str:
    """Exception text can embed credentials from upstream SDK errors."""
    lowered = detail.lower()
    if any(field in lowered for field in _REDACTED):
        return "Upstream service error (details redacted)."
    return detail


def install_error_handling(app: FastAPI) -> None:
    """
    Global handlers: every unhandled exception becomes a logged, generic 500
    so stack traces and internal error strings never reach API clients.
    """

    @app.middleware("http")
    async def request_id_and_access_log(request: Request, call_next):
        # Honour an inbound X-Request-Id from proxies/clients for tracing
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token = request_id_var.set(rid)
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-Id"] = rid
            return response
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            _access_logger.info(
                '%s %s -> %s in %.1fms',
                request.method,
                request.url.path,
                status_code,
                elapsed_ms,
            )
            request_id_var.reset(token)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        # 4xx guidance is authored by us and passes through untouched.
        # 5xx details are logged with full context, and anything carrying
        # credential-like substrings is redacted before reaching clients.
        detail = str(exc.detail)
        if exc.status_code >= 500:
            _app_logger.warning("HTTP %s on %s: %s", exc.status_code, request.url.path, detail)
            detail = _redact_if_sensitive(detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": detail},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        _app_logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal error occurred. Please retry shortly."},
        )


def sanitize_upstream_error(exc: Exception) -> str:
    """
    Turns an upstream SDK exception into a client-safe message.
    Use for the few expected 500/502 paths where a short hint is useful.
    Routers log the real exception separately.
    """
    return _redact_if_sensitive(str(exc)[:300]) or "Upstream service error."
