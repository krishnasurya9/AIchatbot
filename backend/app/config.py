from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    """
    Manages application settings and environment variables using Pydantic.
    It automatically reads from a .env file.
    """
    # Application settings
    app_name: str = "Unified AI Backend"
    log_file: str = "backend_app.log"

    # API Keys for different LLM providers
    together_api_key: str | None = None
    google_api_key: str | None = None

    # Database settings
    mongo_uri: str = "mongodb://localhost:27017/"
    mongo_db_name: str = "ai_assistant_db"

    # --- New RAG Settings ---

    # File upload limits
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_FILE_TYPES: List[str] = [
        ".pdf", ".docx", ".txt", ".md", ".py", 
        ".js", ".csv", ".xlsx", ".java", ".cpp"
    ]

    # Chunking strategies
    TEXT_CHUNK_SIZE: int = 1000  # Chars for text/md
    TEXT_OVERLAP: int = 200      # Char overlap for text/md
    CODE_CHUNK_BY: str = "function" # Placeholder, logic in code_splitter.py

    # Storage
    UPLOAD_STORAGE_PATH: str = "./uploaded_files" # For temp storage
    ENABLE_FILE_PERSISTENCE: bool = False # Delete temp files after processing
    
    # --- End New RAG Settings ---

    # Model configuration for pydantic-settings
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding='utf-8',
        extra='ignore'
    )

# Create a single, importable instance of the settings
settings = Settings()
