from app.config import settings
from app.logger import logger

import os
import asyncio
import logging
import google.generativeai as genai
from langchain_core.runnables import RunnableLambda
from langchain_core.messages import AIMessage

logger = logging.getLogger(__name__)

# module-level placeholders
_gemini_model = None
_embedding_model = None
_initialized = False


class _AsyncModelWrapper(RunnableLambda):
    """LangChain-compatible async wrapper to provide awaitable ainvoke() and aembed_query()."""

    def __init__(self, model):
        self._model = model
        # Initialize RunnableLambda with our async invoke function
        super().__init__(self._invoke_wrapper, afunc=self._ainvoke_wrapper)

    def __getattr__(self, name):
        # Delegate attribute access to the wrapped model
        if name.startswith('_'):
            raise AttributeError(f"'{type(self).__name__}' object has no attribute '{name}'")
        return getattr(self._model, name)

    def _invoke_wrapper(self, input_data, **kwargs):
        """Sync wrapper for LangChain compatibility."""
        # For sync calls, we need to handle the input appropriately
        if isinstance(input_data, dict):
            prompt = input_data
        else:
            prompt = str(input_data)
        
        response = self._model.generate_content(prompt)
        return AIMessage(content=response.text)

    async def _ainvoke_wrapper(self, input_data, **kwargs):
        """Async wrapper for LangChain compatibility."""
        loop = asyncio.get_running_loop()
        
        # Handle different input formats from LangChain
        if isinstance(input_data, str):
            prompt = input_data
        elif hasattr(input_data, 'messages'):
            # LangChain ChatPromptValue with messages
            messages = input_data.messages
            # Convert messages to text
            prompt = "\n".join([msg.content if hasattr(msg, 'content') else str(msg) for msg in messages])
        elif isinstance(input_data, list):
            # List of messages
            prompt = "\n".join([msg.content if hasattr(msg, 'content') else str(msg) for msg in input_data])
        elif isinstance(input_data, dict):
            # Dict might have a 'messages' key or other content
            if 'messages' in input_data:
                prompt = "\n".join([msg.content if hasattr(msg, 'content') else str(msg) for msg in input_data['messages']])
            else:
                prompt = str(input_data)
        else:
            prompt = str(input_data)

        # Use the native Gemini model's generate_content
        if hasattr(self._model, "generate_content_async"):
            response = await self._model.generate_content_async(prompt)
        else:
            response = await loop.run_in_executor(
                None, 
                lambda: self._model.generate_content(prompt)
            )
        
        # Return AIMessage for LangChain compatibility
        return AIMessage(content=response.text)

    async def ainvoke(self, input_data, config=None, **kwargs):
        """Override ainvoke to handle LangChain pipeline calls."""
        return await self._ainvoke_wrapper(input_data, **kwargs)

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
        logger.info("Models already initialized, skipping.")
        return

    try:
        # Accept multiple env names + settings
        api_key = (
            os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or getattr(settings, "gemini_api_key", None)
            or getattr(settings, "google_api_key", None)
        )

        logger.info(f"Checking API key... Found: {bool(api_key)}")

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
        raw_chat_model = genai.GenerativeModel("gemini-2.5-flash")
        _gemini_model = _AsyncModelWrapper(raw_chat_model)
        logger.info("Gemini 2.5 Flash chat model initialized.")

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
