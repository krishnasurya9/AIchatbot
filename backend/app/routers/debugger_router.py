from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from backend.app.services import debugger

router = APIRouter(prefix="/api/debugger", tags=["Debugger"])

class DebuggerInput(BaseModel):
    session_id: str
    message: Optional[str] = None
    query: Optional[str] = None
    mode: Optional[str] = None

@router.post("/chat")
async def debug_chat(
    payload: DebuggerInput,
    use_rag: Optional[bool] = True
):
    user_message = payload.message or payload.query or ""
    return await debugger.get_chat_response(
        session_id=payload.session_id,
        user_message=user_message,
        use_rag=use_rag,
        mode=payload.mode
    )
