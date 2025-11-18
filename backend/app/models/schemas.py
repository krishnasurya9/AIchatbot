from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# --- Base Application Schemas ---

class UserCreate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None

class UserOut(BaseModel):
    user_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    created_at: datetime

class ConversationCreate(BaseModel):
    source: str = Field(..., description="chatbot or vscode")
    title: Optional[str] = None

class ConversationOut(BaseModel):
    conversation_id: str
    user_id: str
    source: str
    title: Optional[str] = None
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

# --- RAG Schemas ---

class RAGQuery(BaseModel):
    question: str
    file_types: Optional[List[str]] = None
    session_id: Optional[str] = None

class RAGUploadResponse(BaseModel):
    file_id: str
    file_name: str
    status: str

class RAGStatusResponse(BaseModel):
    file_id: str
    file_name: str
    status: str
    chunks_created: int
    error: Optional[str] = None

class RAGSource(BaseModel):
    file: str
    content_snippet: str
    relevance_score: float
    page: Optional[int] = None
    function: Optional[str] = None
    section: Optional[str] = None

class RAGQueryResponse(BaseModel):
    answer: str
    sources: List[RAGSource]

class RAGDeleteResponse(BaseModel):
    file_id: str
    status: str
