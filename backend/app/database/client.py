# from motor.motor_asyncio import AsyncIOMotorClient
# from app.config import settings
# from app.logger import logger

# class DatabaseClient:
#     _client: AsyncIOMotorClient | None = None

#     def get_client(self) -> AsyncIOMotorClient:
#         if self._client is None:
#             logger.info(f"Connecting to MongoDB at {settings.mongo_uri}...")
#             self._client = AsyncIOMotorClient(settings.mongo_uri)
#             logger.info("MongoDB client initialized.")
#         return self._client

#     def get_database(self):
#         return self.get_client()[settings.mongo_db_name]

#     async def close_connection(self):
#         if self._client:
#             self._client.close()
#             self._client = None
#             logger.info("MongoDB connection closed.")

# db_client = DatabaseClient()

# async def connect_to_mongo():
#     db_client.get_client()

# async def close_mongo_connection():
#     await db_client.close_connection()



# app/database/client.py
from motor.motor_asyncio import AsyncIOMotorClient
from typing import AsyncGenerator
from app.config import settings
from app.logger import logger

class DatabaseClient:
    """
    Handles MongoDB client creation, database retrieval,
    and connection lifecycle management.
    """
    _client: AsyncIOMotorClient | None = None

    def get_client(self) -> AsyncIOMotorClient:
        """Return Mongo client. Initialize if not already created."""
        if self._client is None:
            logger.info(f"Connecting to MongoDB at {settings.mongo_uri}...")
            self._client = AsyncIOMotorClient(
                settings.mongo_uri, 
                tz_aware=True  # keep consistency with second snippet
            )
            logger.info("MongoDB client initialized.")
        return self._client

    def get_database(self):
        """Return the MongoDB database object."""
        return self.get_client()[settings.mongo_db_name]

    async def close_connection(self):
        """Close the MongoDB connection."""
        if self._client:
            self._client.close()
            self._client = None
            logger.info("MongoDB connection closed.")

# Singleton instance of DatabaseClient
db_client = DatabaseClient()

# Lifecycle functions (to be used in FastAPI startup/shutdown events)
async def connect_to_mongo():
    db_client.get_client()

async def close_mongo_connection():
    await db_client.close_connection()

# FastAPI dependency
async def get_db() -> AsyncGenerator:
    """
    FastAPI dependency.
    Usage: db = Depends(get_db)
    Returns Motor database object.
    """
    db = db_client.get_database()
    try:
        yield db
    finally:
        # don't close global client here (reuse connection)
        pass
