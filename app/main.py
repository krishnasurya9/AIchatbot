from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.logger import logger
# --- MODIFICATION: Import the new sessions_router ---
from app.routers import tutor_router, debugger_router, rag_router, admin_router, sessions_router
from app.database.client import connect_to_mongo, close_mongo_connection

# Initialize the FastAPI application
app = FastAPI(
    title=settings.app_name,
    description="A unified backend for AI-powered coding assistance, tutoring, and debugging.",
    version="2.0.0"
)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add startup and shutdown event handlers
app.add_event_handler("startup", connect_to_mongo)
app.add_event_handler("shutdown", close_mongo_connection)


# Include the API routers
app.include_router(admin_router.router, prefix="/api/admin", tags=["Admin"])
app.include_router(tutor_router.router, prefix="/api/tutor", tags=["AI Tutor"])
app.include_router(debugger_router.router, prefix="/api/debugger", tags=["AI Debugger"])
app.include_router(rag_router.router, prefix="/api/rag", tags=["RAG"])
# --- MODIFICATION: Include the new sessions router ---
app.include_router(sessions_router.router, prefix="/api/sessions", tags=["Session Management"])


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception for request {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal server error occurred."},
    )

@app.get("/", tags=["Root"])
async def read_root():
    return {"message": f"Welcome to the {settings.app_name}!"}
