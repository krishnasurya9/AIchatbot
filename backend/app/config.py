from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Manages application settings and environment variables using Pydantic.
    It automatically reads from a .env file.
    """
    # Application settings
    app_name: str = "Unified AI Backend"
    log_file: str = "backend_app.log"

    # API Keys for different LLM providers
    # together_api_key: str | None = None
    google_api_key: str | None = None
    DEFAULT_MODEL: str = "gemini-2.5-flash-lite-preview-09-2025"

    # Database settings
    mongo_uri: str = "mongodb://localhost:27017/"
    mongo_db_name: str = "ai_assistant_db"

    # Model configuration for pydantic-settings
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding='utf-8',
        extra='ignore'
    )

# Create a single, importable instance of the settings
settings = Settings()

