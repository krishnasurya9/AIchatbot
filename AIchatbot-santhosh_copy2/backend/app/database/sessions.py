# app/database/sessions.py
import uuid
from datetime import datetime
from bson import ObjectId
from typing import List, Dict, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

USERS_COLL = "users"
CONV_COLL = "conversations"
MSG_COLL = "messages"

def _now():
    return datetime.utcnow()

async def create_user(db: AsyncIOMotorDatabase, name: Optional[str] = None, email: Optional[str] = None) -> Dict:
    user_id = str(uuid.uuid4())
    doc = {
        "user_id": user_id,
        "name": name,
        "email": email,
        "created_at": _now()
    }
    await db[USERS_COLL].insert_one(doc)
    return doc

async def get_user_by_id(db: AsyncIOMotorDatabase, user_id: str) -> Optional[Dict]:
    return await db[USERS_COLL].find_one({"user_id": user_id})

async def get_user_by_email(db: AsyncIOMotorDatabase, email: str) -> Optional[Dict]:
    return await db[USERS_COLL].find_one({"email": email})

async def create_or_get_user(db: AsyncIOMotorDatabase, name: Optional[str] = None, email: Optional[str] = None) -> Dict:
    if email:
        existing = await get_user_by_email(db, email)
        if existing:
            return existing
    return await create_user(db, name, email)

async def create_conversation(db: AsyncIOMotorDatabase, user_id: str, source: str, title: Optional[str] = None) -> Dict:
    conversation_id = str(uuid.uuid4())
    now = _now()
    doc = {
        "conversation_id": conversation_id,
        "user_id": user_id,
        "source": source,
        "title": title,
        "created_at": now,
        "last_updated": now
    }
    await db[CONV_COLL].insert_one(doc)
    return doc

async def get_conversations_for_user(db: AsyncIOMotorDatabase, user_id: str) -> List[Dict]:
    cursor = db[CONV_COLL].find({"user_id": user_id}).sort("last_updated", -1)
    return await cursor.to_list(length=100)

async def get_conversation_by_id(db: AsyncIOMotorDatabase, conversation_id: str) -> Optional[Dict]:
    return await db[CONV_COLL].find_one({"conversation_id": conversation_id})

async def add_message(db: AsyncIOMotorDatabase, conversation_id: str, role: str, content: str) -> Dict:
    now = _now()
    doc = {
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "timestamp": now,
    }
    res = await db[MSG_COLL].insert_one(doc)
    # update conversation last_updated
    await db[CONV_COLL].update_one({"conversation_id": conversation_id}, {"$set": {"last_updated": now}})
    doc["message_id"] = str(res.inserted_id)
    return doc

async def get_messages_for_conversation(db: AsyncIOMotorDatabase, conversation_id: str, limit: int = 100, skip: int = 0):
    cursor = db[MSG_COLL].find({"conversation_id": conversation_id}).sort("timestamp", 1).skip(skip).limit(limit)
    return await cursor.to_list(length=limit)
