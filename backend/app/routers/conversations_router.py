# app/routers/conversations_router.py
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.app.models.schemas import ConversationCreate, ConversationOut, MessageCreate, MessageOut
from backend.app.database.client import get_db
from backend.app.database.sessions import create_conversation, get_conversation_by_id, add_message, get_messages_for_conversation
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/conversations",tags=["conversations"])

@router.post("/users/{user_id}/conversations", response_model=ConversationOut)
async def create_conversation_endpoint(user_id: str, payload: ConversationCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    # If source is vscode we always create a new conversation; for chatbot the frontend decides when to create new or reuse
    conv = await create_conversation(db, user_id=user_id, source=payload.source, title=payload.title)
    return {
        "conversation_id": conv["conversation_id"],
        "user_id": conv["user_id"],
        "source": conv["source"],
        "title": conv.get("title"),
        "created_at": conv["created_at"],
        "last_updated": conv["last_updated"]
    }

@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def get_messages_endpoint(conversation_id: str, db: AsyncIOMotorDatabase = Depends(get_db), limit: int = Query(200), skip: int = 0):
    conv = await get_conversation_by_id(db, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = await get_messages_for_conversation(db, conversation_id, limit=limit, skip=skip)
    out = []
    for m in messages:
        out.append({
            "message_id": str(m.get("_id") or m.get("message_id")),
            "conversation_id": m["conversation_id"],
            "role": m["role"],
            "content": m["content"],
            "timestamp": m["timestamp"]
        })
    return out

@router.post("/{conversation_id}/messages", response_model=MessageOut)
async def post_message_endpoint(conversation_id: str, payload: MessageCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    conv = await get_conversation_by_id(db, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msg = await add_message(db, conversation_id, payload.role, payload.content)
    return {
        "message_id": msg.get("message_id") or str(msg.get("_id")),
        "conversation_id": msg["conversation_id"],
        "role": msg["role"],
        "content": msg["content"],
        "timestamp": msg["timestamp"]
    }
