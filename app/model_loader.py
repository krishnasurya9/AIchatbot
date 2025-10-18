from app.config import settings
from app.logger import logger

# Placeholder for different LLM clients
_together_client = None
_gemini_client = None

def get_together_ai_client():
    """Initializes and returns the Together AI client for the Tutor service."""
    global _together_client
    if _together_client is None:
        if settings.together_api_key:
            try:
                import together
                _together_client = together.Together(api_key=settings.together_api_key)
                logger.info("Together AI client initialized successfully.")
            except ImportError:
                logger.error("The 'together' package is not installed.")
            except Exception as e:
                logger.error(f"Failed to initialize Together AI client: {e}")
        else:
            logger.warning("TOGETHER_API_KEY not set. Tutor service will be mocked.")
    return _together_client

def get_gemini_model():
    """Initializes and returns the Gemini model for the Debugger service."""
    global _gemini_client
    if _gemini_client is None:
        if settings.google_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                _gemini_client = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0.2)
                logger.info("Google Gemini model initialized successfully.")
            except ImportError:
                 logger.error("LangChain Google GenAI is not installed.")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini model: {e}")
        else:
            logger.warning("GOOGLE_API_KEY not set. Debugger service will be mocked.")
    return _gemini_client

