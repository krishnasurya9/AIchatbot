from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.logger import logger

from app.routers import (
    tutor_router,
    debugger_router,
    rag_router,
    admin_router,
    sessions_router,
    users_router,
    conversations_router,
)
from app.database.client import connect_to_mongo, close_mongo_connection
from app.llm import llm_router  # ✅ Unified LLM router (Gemini + Together AI)
from pydantic import BaseModel
from typing import Optional

# ------------------------------------------------------------
# ✅ FastAPI Initialization
# ------------------------------------------------------------
app = FastAPI(
    title=settings.app_name,
    description="A unified backend for AI-powered tutoring, debugging, and multi-LLM chat.",
    version="2.0.0"
)

# ------------------------------------------------------------
# ✅ CORS Middleware Setup
# ------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev: allow all origins; restrict later if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------
# ✅ Database Lifecycle Events
# ------------------------------------------------------------
app.add_event_handler("startup", connect_to_mongo)
app.add_event_handler("shutdown", close_mongo_connection)

# ------------------------------------------------------------
# ✅ Router Registrations
# ------------------------------------------------------------
app.include_router(users_router.router, prefix="/api", tags=["Users"])
app.include_router(conversations_router.router, prefix="/api", tags=["Conversations"])
app.include_router(tutor_router.router, prefix="/api", tags=["AI Tutor"])
app.include_router(debugger_router.router, prefix="/api", tags=["AI Debugger"])
app.include_router(rag_router.router, prefix="/api", tags=["RAG"])
app.include_router(admin_router.router, prefix="/api", tags=["Admin"])
app.include_router(sessions_router.router, prefix="/api", tags=["Session Management"])
app.include_router(llm_router.router, prefix="/api", tags=["LLM"])  # ✅ New multi-model endpoint

# ------------------------------------------------------------
# ✅ Global Exception Handler
# ------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception for request {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal server error occurred."},
    )

# ------------------------------------------------------------
# ✅ Compatibility Endpoint for Frontend
# ------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    mode: Optional[str] = "deep"  # "fast" or "deep"
    session_id: Optional[str] = None

@app.post("/chat", tags=["Compatibility"])
async def chat_endpoint(req: ChatRequest):
    """
    Compatibility endpoint for frontend that expects /chat with {message: string}
    Forwards to the LLM router with default Gemini model.
    Supports mode parameter: "fast" for quick responses, "deep" for comprehensive answers.
    """
    try:
        from app.llm.model_loader import get_gemini_model
        from langchain_core.prompts import ChatPromptTemplate
        
        model = get_gemini_model()
        if not model:
            return {"reply": "⚠️ Gemini model not initialized. Please check your API keys."}
        
        # Use different prompts based on mode
        if req.mode and req.mode.lower() == "fast":
            prompt_template = ChatPromptTemplate.from_template(
                "Give a concise, direct answer to: {question}"
            )
        else:
            prompt_template = ChatPromptTemplate.from_template(
                "You are a helpful AI assistant. Provide a comprehensive answer to: {question}"
            )
        
        chain = prompt_template | model
        response = await chain.ainvoke({"question": req.message})
        reply = response.content if hasattr(response, "content") else str(response)
        return {"reply": reply}
    except Exception as e:
        logger.error(f"Error in /chat endpoint: {e}", exc_info=True)
        return {"reply": f"⚠️ Error: {str(e)}"}

# ------------------------------------------------------------
# ✅ Root Endpoint
# ------------------------------------------------------------
@app.get("/", tags=["Root"])
async def read_root():
    """
    Basic API health check endpoint.
    """
    return {"message": f"Welcome to {settings.app_name} backend — LLM services are live!"}
