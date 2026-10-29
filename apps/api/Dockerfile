# RAG Chatbot API - production image
# Build context must be the apps/api directory:
#   docker build -t rag-api ./apps/api
FROM python:3.10-slim

# No .pyc files, unbuffered logs so the platform captures them immediately
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/embedding-cache

WORKDIR /app

# Install dependencies first to maximise Docker layer caching
COPY ./requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /app/requirements.txt

# Bake the sentence-transformers weights into the image so cold starts are
# fast and the container does not depend on Hugging Face at boot time.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')" \
    && chmod -R a+r /opt/embedding-cache

# Copy the API source code (venv/.env are excluded via .dockerignore)
COPY ./ /app/

# Drop root privileges (required by Hugging Face Spaces, good practice anyway)
RUN useradd -m -u 1000 appuser && chown -R appuser /app
USER appuser

# PORT 7860 keeps the Hugging Face Spaces default; override for other platforms
ENV PORT=7860 \
    APP_ENV=production \
    LOG_LEVEL=INFO

EXPOSE 7860

# Lightweight in-container healthcheck (no curl needed in the slim image)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD ["python", "-c", "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '7860') + '/health', timeout=4)"]

# WEB_CONCURRENCY lets the platform size the number of worker processes
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers ${WEB_CONCURRENCY:-1}"
