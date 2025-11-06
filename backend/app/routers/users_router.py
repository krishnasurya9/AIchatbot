# app/routers/users_router.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from app.models.schemas import UserCreate, UserOut, ConversationOut
from app.database.client import get_db
from app.database.sessions import create_or_get_user, get_conversations_for_user
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/", response_model=UserOut)
async def create_user_endpoint(payload: UserCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    user = await create_or_get_user(db, name=payload.name, email=payload.email)
    return {
        "user_id": user["user_id"],
        "name": user.get("name"),
        "email": user.get("email"),
        "created_at": user["created_at"]
    }

@router.get("/{user_id}/conversations", response_model=list[ConversationOut])
async def list_user_conversations(user_id: str, db: AsyncIOMotorDatabase = Depends(get_db), limit: int = Query(50)):
    convs = await get_conversations_for_user(db, user_id)
    out = []
    for c in convs[:limit]:
        out.append({
            "conversation_id": c["conversation_id"],
            "user_id": c["user_id"],
            "source": c.get("source"),
            "title": c.get("title"),
            "created_at": c["created_at"],
            "last_updated": c["last_updated"]
        })
    return out
