from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.services import debugger

router = APIRouter(prefix="/debugger", tags=["Debugger"])

class DebuggerInput(BaseModel):
    session_id: str
    message: str
    mode: Optional[str] = "deep"  # "fast" or "deep"

@router.post("/chat")
async def debug_chat(
    payload: DebuggerInput,
    use_rag: Optional[bool] = True
):
    return await debugger.get_chat_response(
        session_id=payload.session_id,
        user_message=payload.message,
        use_rag=use_rag,
        mode=payload.mode
    )
