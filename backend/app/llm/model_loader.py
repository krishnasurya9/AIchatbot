from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from app.config import settings
from app.logger import logger

import os
import logging

logger = logging.getLogger(__name__)

# module-level placeholders
_gemini_model = None
_embedding_model = None
_initialized = False


# ------------------------------------------------------------
# Initialize Models ASYNC
# ------------------------------------------------------------

async def init_models_async():
    """Initialize Gemini main model + embedding model using standard LangChain classes."""
    global _gemini_model, _embedding_model, _initialized

    if _initialized:
        logger.info("Models already initialized, skipping.")
        return

    try:
        api_key = (
            os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or getattr(settings, "gemini_api_key", None)
            or getattr(settings, "google_api_key", None)
        )

        logger.info(f"Checking API key... Found: {bool(api_key)}")

        if not api_key:
            logger.error("Gemini API key missing.")
            return

        # ------------------------
        # Main Gemini Chat Model  
        # ------------------------
        _gemini_model = ChatGoogleGenerativeAI(
            model="models/gemini-flash-latest",
            google_api_key=api_key,
            temperature=0.7
        )
        logger.info("Gemini 1.5 Flash chat model initialized (LangChain).")

        # ------------------------
        # Embedding Model
        # ------------------------
        _embedding_model = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004",
            google_api_key=api_key
        )
        logger.info("Gemini embedding model initialized (LangChain).")

        _initialized = True
        logger.info("All Gemini models initialized successfully.")

    except Exception:
        logger.exception("Failed to initialize Gemini models.")
        _initialized = False


# ------------------------------------------------------------
# Getters
# ------------------------------------------------------------

def get_gemini_model():
    """Returns initialized chat model."""
    if not _initialized:
        raise RuntimeError("Models not initialized. Call init_models_async() at startup.")
    return _gemini_model


def get_embedding_model():
    """Returns embedding model."""
    if not _initialized:
        logger.error("Embedding model requested before initialization.")
        return None
    return _embedding_model


# ------------------------------------------------------------
# Utility for RAG
# ------------------------------------------------------------

async def embed_query_to_vector(embed_model, query: str):
    """Ensures the vector returned is a clean Python list."""
    result = await embed_model.aembed_query(query)

    # Normalize possible outputs
    if isinstance(result, dict) and "embedding" in result:
        return result["embedding"]

    if hasattr(result, "tolist"):
        return result.tolist()

    return list(result)
