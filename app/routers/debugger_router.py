from fastapi import APIRouter
from pydantic import BaseModel
from app.services.llm_service import sanitize_input, query_llm

router = APIRouter(prefix="/debugger", tags=["Debugger"])

class DebuggerInput(BaseModel):
    query: str

@router.post("/chat")
async def debug_chat(payload: DebuggerInput):
    q = sanitize_input(payload.query)
    return await query_llm(q, "debugger")

