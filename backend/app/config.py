from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Manages application settings and environment variables using Pydantic.
    Automatically reads from a .env file.
    """

    # ------------------------------------------------------------------
    # 🧩 Application Metadata
    # ------------------------------------------------------------------
    app_name: str = "Unified AI Backend"
    log_file: str = "app.log"

    # ------------------------------------------------------------------
    # 🔑 API Keys for LLM Providers
    # ------------------------------------------------------------------
    together_api_key: str | None = None  # ✅ Added back (used in model_loader)
    google_api_key: str | None = None
    DEFAULT_MODEL: str = "gemini-2.5-flash-lite-preview-09-2025"

    # ------------------------------------------------------------------
    # 🗄️ Database Settings
    # ------------------------------------------------------------------
    mongo_uri: str = "mongodb://localhost:27017/"
    mongo_db_name: str = "ai_assistant_db"

    # ------------------------------------------------------------------
    # ⚙️ Model Configuration
    # ------------------------------------------------------------------
    model_config = SettingsConfigDict(
        env_file=".env",           # Loads environment variables
        env_file_encoding="utf-8", # Uses UTF-8 encoding
        extra="ignore"             # Ignores unknown env vars
    )
settings = Settings()

