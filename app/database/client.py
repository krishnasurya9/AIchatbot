from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from app.logger import logger

class DatabaseClient:
    _client: AsyncIOMotorClient | None = None

    def get_client(self) -> AsyncIOMotorClient:
        if self._client is None:
            logger.info(f"Connecting to MongoDB at {settings.mongo_uri}...")
            self._client = AsyncIOMotorClient(settings.mongo_uri)
            logger.info("MongoDB client initialized.")
        return self._client

    def get_database(self):
        return self.get_client()[settings.mongo_db_name]

    async def close_connection(self):
        if self._client:
            self._client.close()
            self._client = None
            logger.info("MongoDB connection closed.")

db_client = DatabaseClient()

async def connect_to_mongo():
    db_client.get_client()

async def close_mongo_connection():
    await db_client.close_connection()

