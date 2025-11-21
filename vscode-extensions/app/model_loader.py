import google.generativeai as genai
from app.config import settings
from app.logger import logger

genai.configure(api_key=settings.GOOGLE_API_KEY)

def get_gemini_model(model: str = None):
    """
    Loads Gemini model with fallback support.
    If Pro model fails, switches to Flash variant automatically.
    """
    model_name = model or settings.DEFAULT_MODEL
    try:
        logger.info(f"Loading Gemini model: {model_name}")
        return genai.GenerativeModel(model_name)
    except Exception as e:
        logger.warning(f"Primary model failed ({model_name}): {e}")
        try:
            fallback_model = "gemini-1.5-flash"
            logger.info(f"Switching to fallback model: {fallback_model}")
            return genai.GenerativeModel(fallback_model)
        except Exception as e2:
            logger.error(f"Both Gemini models failed: {e2}")
            raise RuntimeError("Gemini model initialization failed.")
