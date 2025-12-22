from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from datetime import datetime
import uuid

from app.database.client import get_db
from app.database.sessions import (
    create_conversation,
    get_conversation_by_id,
    add_message,
    get_messages_for_conversation,
)
from app.models.schemas import MessageCreate, MessageOut, ConversationOut

router = APIRouter(prefix="/sessions")

class SessionInit(BaseModel):
    session_id: str

@router.post("", summary="Ensure Session Exists", response_model=ConversationOut)
async def ensure_session(payload: SessionInit, db=Depends(get_db)):
    session_id = payload.session_id

    # Check if already exists
    session = await get_conversation_by_id(db, session_id)
    if session:
        return session

    # Create new session for this device (source can be web/vscode)
    session = await create_conversation(db, user_id="anonymous", source="client")
    return session


@router.post("/{session_id}/messages", summary="Store New Message", response_model=MessageOut)
async def post_message(session_id: str, msg: MessageCreate, db=Depends(get_db)):
    session = await get_conversation_by_id(db, session_id)
    if not session:
        await create_conversation(db, user_id="anonymous", source="client")

    message = await add_message(db, session_id, msg.role, msg.content)
    return message


@router.get("/{session_id}/messages", summary="Get Session History", response_model=List[MessageOut])
async def fetch_messages(session_id: str, db=Depends(get_db)):
    session = await get_conversation_by_id(db, session_id)
    if not session:
        return []  # no history

    messages = await get_messages_for_conversation(db, session_id, limit=100)
    return messages


@router.delete("/{session_id}", summary="Clear Session Messages")
async def clear_session(session_id: str, db=Depends(get_db)):
    # Mark messages deleted instead of dropping session
    await db["messages"].delete_many({"conversation_id": session_id})

    return {"status": "success", "session_id": session_id}
