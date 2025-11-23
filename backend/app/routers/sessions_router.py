from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import uuid4, UUID
from datetime import datetime

# Import the database collections we will interact with
from app.database.client import db_client

router = APIRouter()

# Get references to the MongoDB collections
sessions_collection = db_client.get_database().get_collection("sessions")
messages_collection = db_client.get_database().get_collection("messages")


# --- Pydantic Schemas for Data Validation ---
class Session(BaseModel):
    session_id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user_id: Optional[str] = None
    title: str = "New Conversation"

class Message(BaseModel):
    session_id: UUID
    role: str  # "user" or "ai"
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# --- API Endpoints for Session Management ---

@router.post("/", response_model=Session, summary="Create a New Session")
async def create_new_session():
    """
    Creates a new session document in the database and returns it.
    This endpoint establishes a unique identifier for a new conversation.
    """
    new_session = Session()
    # Pydantic models need to be converted to dicts for MongoDB
    await sessions_collection.insert_one(new_session.model_dump(by_alias=True))
    return new_session

@router.get("/{session_id}/messages", response_model=List[Message], summary="Get Session History")
async def get_session_history(session_id: UUID):
    """
    Fetches the entire conversation history for a given session ID,
    sorted by timestamp.
    """
    messages_cursor = messages_collection.find({"session_id": session_id}).sort("timestamp")
    # Limit to the last 200 messages for performance
    history = await messages_cursor.to_list(length=200) 
    return history

@router.post("/{session_id}/messages", response_model=Message, summary="Store a New Message")
async def store_message(session_id: UUID, message: Message):
    """
    Stores a new message (either from the user or the AI) in the 
    conversation history for the specified session.
    """
    if session_id != message.session_id:
        raise HTTPException(status_code=400, detail="Session ID in URL does not match session ID in message body.")
    
    await messages_collection.insert_one(message.model_dump(by_alias=True))
    return message

@router.post("/{session_id}/clear", summary="Clear Session History")
async def clear_session(session_id: UUID):
    """
    Clears all messages and history for a given session.
    Also clears in-memory session stores.
    """
    try:
        # Clear messages from database
        result = await messages_collection.delete_many({"session_id": session_id})
        
        # Clear in-memory stores
        from app.memory import clear_session_history
        clear_session_history(str(session_id))
        
        return {
            "session_id": str(session_id),
            "status": "cleared",
            "messages_deleted": result.deleted_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear session: {str(e)}")
