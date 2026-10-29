import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

# Ensures .env is loaded and validates required configuration before routers import
import services.env  # noqa: F401
from services.observability import install_error_handling, setup_logging

setup_logging()

IS_PRODUCTION = os.getenv("APP_ENV", "development").lower() in ("production", "prod")

app = FastAPI(
    title="RAG Chatbot API",
    version="1.0.0",
    # Swagger/ReDoc are convenient locally but should not be public in prod
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
)

# Origins are configurable via env for production deployment
_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
allow_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Publishable-Key", "X-Request-Id"],
    expose_headers=["X-Request-Id", "Retry-After"],
)

# Request IDs, access logs and safe (non-leaking) error payloads
install_error_handling(app)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if IS_PRODUCTION:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


from routers import upload, chat, widget  # noqa: E402

app.include_router(upload.router, prefix="/api/v1", tags=["Documents"])
app.include_router(chat.router, prefix="/api/v1", tags=["Chat"])
# Public embeddable widget - guarded by a workspace publishable key + rate limit
app.include_router(widget.router, prefix="/api/v1", tags=["Widget"])


@app.get("/")
def read_root():
    return {"message": "Welcome to RAG Chatbot API", "status": "online"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "RAG API"}


@app.get("/health/ready")
def readiness_check():
    """Verifies outbound dependencies so orchestrators can gate traffic."""
    from services.rag import qdrant as vector_store

    checks = {"qdrant": False, "supabase": False, "groq": bool(os.getenv("GROQ_API_KEY"))}
    try:
        vector_store.get_collections()
        checks["qdrant"] = True
    except Exception:
        pass
    try:
        from services.supabase_client import get_supabase_admin

        get_supabase_admin().table("workspaces").select("id").limit(1).execute()
        checks["supabase"] = True
    except Exception:
        pass

    healthy = all(checks.values())
    return {"status": "ready" if healthy else "degraded", "checks": checks}
