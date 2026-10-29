import os
from pathlib import Path

from dotenv import load_dotenv

# Load from apps/api/.env regardless of the process working directory so
# `uvicorn main:app` behaves identically from the repo root or a container.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "QDRANT_URL", "GROQ_API_KEY"]

_missing = [key for key in REQUIRED_ENVS if not os.getenv(key)]

if _missing:
    message = f"Missing required environment variable(s): {', '.join(_missing)}"
    if os.getenv("APP_ENV", "development").lower() in ("production", "prod"):
        # Never boot a production instance half-configured
        raise RuntimeError(message)
    print(f"[WARNING] {message}")
