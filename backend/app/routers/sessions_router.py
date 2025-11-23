# from fastapi import APIRouter, HTTPException
# from pydantic import BaseModel, Field
# from typing import List, Optional
# from uuid import uuid4, UUID
# from datetime import datetime

# # Import the database collections we will interact with
# from backend.app.database.client import db_client

# router = APIRouter()

# # Get references to the MongoDB collections
# sessions_collection = db_client.get_database().get_collection("sessions")
# messages_collection = db_client.get_database().get_collection("messages")


# # --- Pydantic Schemas for Data Validation ---
# class Session(BaseModel):
#     session_id: UUID = Field(default_factory=uuid4)
#     created_at: datetime = Field(default_factory=datetime.utcnow)
#     user_id: Optional[str] = None
#     title: str = "New Conversation"

# class Message(BaseModel):
#     session_id: UUID
#     role: str  # "user" or "ai"
#     content: str
#     timestamp: datetime = Field(default_factory=datetime.utcnow)


# # --- API Endpoints for Session Management ---

# @router.post("/", response_model=Session, summary="Create a New Session")
# async def create_new_session():
#     """
#     Creates a new session document in the database and returns it.
#     This endpoint establishes a unique identifier for a new conversation.
#     """
#     new_session = Session()
#     # Pydantic models need to be converted to dicts for MongoDB
#     await sessions_collection.insert_one(new_session.model_dump(by_alias=True))
#     return new_session

# @router.get("/{session_id}/messages", response_model=List[Message], summary="Get Session History")
# async def get_session_history(session_id: UUID):
#     """
#     Fetches the entire conversation history for a given session ID,
#     sorted by timestamp.
#     """
#     messages_cursor = messages_collection.find({"session_id": session_id}).sort("timestamp")
#     # Limit to the last 200 messages for performance
#     history = await messages_cursor.to_list(length=200) 
#     return history

# @router.post("/{session_id}/messages", response_model=Message, summary="Store a New Message")
# async def store_message(session_id: UUID, message: Message):
#     """
#     Stores a new message (either from the user or the AI) in the 
#     conversation history for the specified session.
#     """
#     if session_id != message.session_id:
#         raise HTTPException(status_code=400, detail="Session ID in URL does not match session ID in message body.")
    
#     await messages_collection.insert_one(message.model_dump(by_alias=True))
#     return message

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()

# In-memory storage for sessions (replace with MongoDB in production)
sessions_db = {}

class Message(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: Optional[str] = None

class SessionResponse(BaseModel):
    session_id: str
    messages: List[Message]
    created_at: str
    updated_at: str

@router.post("/api/sessions/{session_id}/messages")
async def add_message(session_id: str, message: Message):
    """Add a message to a session for shared conversation history"""
    
    if session_id not in sessions_db:
        sessions_db[session_id] = {
            "session_id": session_id,
            "messages": [],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
    
    # Add timestamp if not provided
    if not message.timestamp:
        message.timestamp = datetime.now().isoformat()
    
    sessions_db[session_id]["messages"].append(message.dict())
    sessions_db[session_id]["updated_at"] = datetime.now().isoformat()
    
    return {
        "status": "success",
        "message": "Message added to session",
        "session_id": session_id
    }

@router.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str):
    """Get all messages for a session"""
    
    if session_id not in sessions_db:
        return {
            "session_id": session_id,
            "messages": [],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
    
    return sessions_db[session_id]

@router.delete("/api/sessions/{session_id}/messages")
async def clear_messages(session_id: str):
    """Clear all messages from a session"""
    
    if session_id in sessions_db:
        sessions_db[session_id]["messages"] = []
        sessions_db[session_id]["updated_at"] = datetime.now().isoformat()
    
    return {
        "status": "success",
        "message": "Session history cleared",
        "session_id": session_id
    }

@router.post("/api/sessions/{session_id}/clear")
async def clear_session(session_id: str):
    if session_id in sessions_db:
        sessions_db[session_id]["messages"] = []
        sessions_db[session_id]["updated_at"] = datetime.now().isoformat()
    else:
        sessions_db[session_id] = {
            "session_id": session_id,
            "messages": [],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
    return {
        "status": "success",
        "message": "Session cleared",
        "session_id": session_id
    }

@router.get("/api/sessions")
async def list_sessions():
    """List all active sessions"""
    return {
        "sessions": [
            {
                "session_id": sid,
                "message_count": len(data["messages"]),
                "created_at": data["created_at"],
                "updated_at": data["updated_at"]
            }
            for sid, data in sessions_db.items()
        ]
    }