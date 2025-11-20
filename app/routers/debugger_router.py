from fastapi import APIRouter
from pydantic import BaseModel
from app.services.llm_service import query_llm

router = APIRouter(prefix="/debugger", tags=["Debugger"])

class DebuggerInput(BaseModel):
    query: str

@router.post("/chat")
async def debug_chat(payload: DebuggerInput):
    return await query_llm(payload.query, "debugger")
