from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

# Imports for Routers
from app.routers import (
    tutor_router,
    debugger_router,
    rag_router,
    users_router,
    conversations_router,
    sessions_router,
    admin_router
)

# Imports for Database + Model initialization
from app.database.client import connect_to_mongo, close_mongo_connection, db_client
from app.llm.model_loader import init_models_async

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# -------------------- LIFESPAN SETUP --------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Application starting up...")

    # Connect to DB
    await connect_to_mongo()
    logger.info("🗄️ MongoDB Connected")

    # Initialize AI models
    logger.info("⚙️ Initializing AI Models...")
    await init_models_async()
    logger.info("🤖 AI Models Ready")

    yield  # Application running...

    # Shutdown cleanup
    await close_mongo_connection()
    logger.info("🔌 MongoDB Connection Closed")
    logger.info("👋 Application shutdown complete")


# -------------------- FASTAPI APP INSTANCE --------------------
app = FastAPI(
    title="AI Dev Companion API",
    description="Backend powering tutor, debugger & shared chat history",
    version="2.0.0",
    lifespan=lifespan
)


# -------------------- CORS --------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict later in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------- ROUTERS --------------------
app.include_router(tutor_router.router, tags=["Tutor"])
app.include_router(debugger_router.router, tags=["Debugger"])
app.include_router(rag_router.router, tags=["RAG"])
app.include_router(users_router.router, tags=["Users"])
app.include_router(conversations_router.router, tags=["Conversations"])
app.include_router(sessions_router.router, prefix="/api", tags=["Sessions"])
app.include_router(admin_router.router, tags=["Admin"])


# -------------------- HEALTH CHECK ROUTES --------------------
@app.get("/", tags=["Root"])
async def root():
    return {
        "status": "online",
        "message": "AI Backend is running!",
        "version": "2.0.0"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "database": "connected" if db_client._client else "disconnected"
    }
