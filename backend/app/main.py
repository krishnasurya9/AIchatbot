from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.routers import tutor_router, debugger_router, rag_router, users_router, conversations_router, sessions_router, admin_router
from backend.app.database.client import db_client, connect_to_mongo, close_mongo_connection
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Dev Companion API",
    description="AI-powered development assistant with RAG and shared conversation history",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(tutor_router.router, tags=["Tutor"])
app.include_router(debugger_router.router, tags=["Debugger"])
app.include_router(rag_router.router, tags=["RAG"])
app.include_router(users_router.router, tags=["Users"])
app.include_router(conversations_router.router, tags=["Conversations"])
app.include_router(sessions_router.router, tags=["Sessions"])
app.include_router(admin_router.router, tags=["Debug"])

@app.on_event("startup")
async def startup_db_client():
    """Initialize database connection on startup"""
    try:
        await connect_to_mongo()
        logger.info("Successfully connected to MongoDB")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    """Close database connection on shutdown"""
    try:
        await close_mongo_connection()
        logger.info("Successfully closed MongoDB connection")
    except Exception as e:
        logger.error(f"Error closing MongoDB connection: {e}")

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "message": "AI Dev Companion API is running",
        "version": "1.0.0",
        "endpoints": {
            "tutor": "/api/tutor/chat",
            "debugger": "/api/debugger/chat",
            "rag_upload": "/api/rag/upload",
            "rag_query": "/api/rag/query",
            "sessions": "/api/sessions/{session_id}/messages"
        }
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "database": "connected" if db_client._client else "disconnected",
        "services": {
            "tutor": "active",
            "debugger": "active",
            "rag": "active"
        }
    }