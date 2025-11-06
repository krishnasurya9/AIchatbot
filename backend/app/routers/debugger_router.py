from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.app.services import debugger
from backend.app.memory import get_active_sessions, clear_session_history, get_session_history

router = APIRouter()

class ChatRequest(BaseModel):
    session_id: str
    message: str

@router.post("/chat", summary="Send a Message to the Debugger")
async def chat(req: ChatRequest):
    try:
        response = await debugger.get_chat_response(
            session_id=req.session_id,
            user_message=req.message
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions", summary="List Active Debugger Sessions")
async def list_sessions():
    return {"sessions": get_active_sessions()}

@router.get("/sessions/{session_id}", summary="Get Session History")
async def get_messages(session_id: str):
    history = get_session_history(session_id)
    return {"session_id": session_id, "messages": history.messages}

@router.post("/sessions/{session_id}/clear", summary="Clear Session History")
async def clear_session(session_id: str):
    clear_session_history(session_id)
    return {"status": "ok", "message": f"Session {session_id} cleared."}

