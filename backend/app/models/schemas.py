# app/models/schemas.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class UserCreate(BaseModel):
    name: Optional[str]
    email: Optional[str]

class UserOut(BaseModel):
    user_id: str
    name: Optional[str]
    email: Optional[str]
    created_at: datetime

class ConversationCreate(BaseModel):
    source: str = Field(..., description="chatbot or vscode")
    title: Optional[str] = None

class ConversationOut(BaseModel):
    conversation_id: str
    user_id: str
    source: str
    title: Optional[str]
    created_at: datetime
    last_updated: datetime

class MessageCreate(BaseModel):
    role: str  # user | assistant | system
    content: str

class MessageOut(BaseModel):
    message_id: str
    conversation_id: str
    role: str
    content: str
    timestamp: datetime
