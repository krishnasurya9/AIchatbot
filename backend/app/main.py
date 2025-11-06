from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.logger import logger
from backend.app.database.client import connect_to_mongo, close_mongo_connection

# Import all routers
from backend.app.routers import (
    tutor_router,
    debugger_router,
    rag_router,
    admin_router,
    sessions_router,
    users_router,
    conversations_router
)

# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="A unified backend for AI-powered coding assistance, tutoring, and debugging.",
    version="2.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:3000",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Database connection lifecycle
app.add_event_handler("startup", connect_to_mongo)
app.add_event_handler("shutdown", close_mongo_connection)

# Router registrations
app.include_router(users_router.router, prefix="/api")
app.include_router(conversations_router.router, prefix="/api")
app.include_router(tutor_router.router, prefix="/api")
app.include_router(debugger_router.router, prefix="/api")
app.include_router(rag_router.router, prefix="/api")
app.include_router(admin_router.router, prefix="/api")
app.include_router(sessions_router.router, prefix="/api")

# Root endpoint (Health Check)
@app.get("/", tags=["Root"])
async def read_root():
    return {"message": f"Welcome to the {settings.app_name} backend! 🚀"}

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception for request {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal server error occurred."},
    )
