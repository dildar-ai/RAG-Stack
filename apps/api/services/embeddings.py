import logging
import os
import warnings

from sentence_transformers import SentenceTransformer

warnings.filterwarnings("ignore")
logger = logging.getLogger("rag.embeddings")

# Load model globally so it's loaded only once on startup
# Overridable via EMBEDDING_MODEL; the Docker image bakes the weights at build time
_model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
logger.info("Loading embedding model '%s'...", _model_name)
embedding_model = SentenceTransformer(_model_name)
logger.info("Embedding model loaded.")

def get_embedding(text: str) -> list[float]:
    """
    Returns the dense vector for a given string using a lightweight local model.
    """
    return embedding_model.encode(text, normalize_embeddings=True).tolist()

def get_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Batch-encodes many texts in a single (much faster) model pass.
    Used during PDF ingestion where per-block encoding was a bottleneck.
    """
    if not texts:
        return []
    vectors = embedding_model.encode(
        texts,
        batch_size=32,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return vectors.tolist()
