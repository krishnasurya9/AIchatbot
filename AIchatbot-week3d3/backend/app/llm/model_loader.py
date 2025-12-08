from app.config import settings
from app.logger import logger

import os
import asyncio
import logging
import google.generativeai as genai

logger = logging.getLogger(__name__)

# module-level placeholders
_gemini_model = None
_embedding_model = None
_initialized = False


class _AsyncModelWrapper:
    """Async wrapper to provide awaitable ainvoke() and aembed_query()."""

    def __init__(self, model):
        self._model = model

    def __getattr__(self, name):
        return getattr(self._model, name)

    async def ainvoke(self, *args, **kwargs):
        loop = asyncio.get_running_loop()

        if hasattr(self._model, "ainvoke"):
            return await self._model.ainvoke(*args, **kwargs)

        if hasattr(self._model, "invoke"):
            return await loop.run_in_executor(None, lambda: self._model.invoke(*args, **kwargs))

        if callable(self._model):
            return await loop.run_in_executor(None, lambda: self._model(*args, **kwargs))

        raise AttributeError("Model has no invoke/ainvoke")

    async def aembed_query(self, *args, **kwargs):
        loop = asyncio.get_running_loop()

        # Modern Gemini embedding models may implement aembed_query
        if hasattr(self._model, "aembed_query"):
            return await self._model.aembed_query(*args, **kwargs)

        if hasattr(self._model, "embed_query"):
            return await loop.run_in_executor(None, lambda: self._model.embed_query(*args, **kwargs))

        if hasattr(self._model, "embed"):
            return await loop.run_in_executor(None, lambda: self._model.embed(*args, **kwargs))

        raise AttributeError("Model has no embedding method")


# ------------------------------------------------------------
# Initialize Models ASYNC
# ------------------------------------------------------------

async def init_models_async():
    """Initialize Gemini main model + embedding model."""
    global _gemini_model, _embedding_model, _initialized

    if _initialized:
        return

    try:
        # Accept multiple env names + settings
        api_key = (
            os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or getattr(settings, "google_api_key", None)
        )

        if not api_key:
            logger.error("Gemini API key missing (GEMINI_API_KEY or GOOGLE_API_KEY).")
            return

        # Configure Gemini
        try:
            genai.configure(api_key=api_key)
        except Exception as e:
            logger.error(f"Failed to configure Gemini API: {e}")
            return

        # ------------------------
        # Main Gemini Chat Model
        # ------------------------
        raw_chat_model = genai.GenerativeModel("gemini-1.5-flash")
        _gemini_model = _AsyncModelWrapper(raw_chat_model)
        logger.info("Gemini Flash chat model initialized.")

        # ------------------------
        # Embedding Model
        # ------------------------
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        raw_embed_model = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004",
            google_api_key=api_key
        )

        _embedding_model = _AsyncModelWrapper(raw_embed_model)
        logger.info("Gemini embedding model initialized.")

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
