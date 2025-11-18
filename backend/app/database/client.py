from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from app.logger import logger
import pymongo

class DatabaseClient:
    _client: AsyncIOMotorClient | None = None
    _db = None

    def get_client(self) -> AsyncIOMotorClient:
        if self._client is None:
            logger.info(f"Connecting to MongoDB at {settings.mongo_uri}...")
            self._client = AsyncIOMotorClient(settings.mongo_uri)
            logger.info("MongoDB client initialized.")
        return self._client

    def get_database(self):
        if self._db is None:
            self._db = self.get_client()[settings.mongo_db_name]
        return self._db

    async def close_connection(self):
        if self._client:
            self._client.close()
            self._client = None
            self._db = None
            logger.info("MongoDB connection closed.")

    # --- New Collection Properties ---
    @property
    def file_metadata_collection(self):
        return self.get_database()["file_metadata"]
    
    @property
    def all_chunks_collection(self):
        """
        One collection for all chunks (code, pdf, doc)
        to enable unified vector search.
        """
        return self.get_database()["all_chunks"]

    # --- New Index Creation ---
    async def create_indexes(self):
        """
        Creates necessary indexes on startup.
        """
        logger.info("Creating database indexes...")
        db = self.get_database()
        
        try:
            # Index for file_metadata
            await db.file_metadata.create_index(
                [("session_id", 1), ("file_type", 1)], 
                sparse=True
            )
            
            # Indexes for all_chunks
            await db.all_chunks.create_index("file_id")
            await db.all_chunks.create_index(
                [("session_id", 1), ("metadata.file_type", 1)],
                sparse=True
            )
            
            # Note: A text index for BM25 search can be created,
            # but it's often better to manage this with Atlas Search.
            # await db.all_chunks.create_index([("content", pymongo.TEXT)])
            
            # Note: Vector index MUST be created in MongoDB Atlas UI
            # or via the Atlas Admin API. It cannot be created from the driver.
            logger.info("Database indexes checked/created.")
            logger.warning("Remember to create a Vector Search Index named 'vector_index' "
                           "on the 'all_chunks' collection in your MongoDB Atlas deployment.")

        except Exception as e:
            logger.error(f"Error creating indexes: {e}", exc_info=True)


db_client = DatabaseClient()

async def connect_to_mongo():
    db_client.get_client()
    await db_client.create_indexes() # Run index creation on startup

async def close_mongo_connection():
    await db_client.close_connection()
