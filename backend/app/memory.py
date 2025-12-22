from app.logger import logger
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import BaseMessage, AIMessage, HumanMessage

class ChatMessageHistory(BaseChatMessageHistory):
    """In-memory chat message history that's compatible with LangChain."""
    
    def __init__(self):
        self.messages: list[BaseMessage] = []

    def add_message(self, message: BaseMessage) -> None:
        """Add a message to the history."""
        self.messages.append(message)

    def add_ai_message(self, content: str) -> None:
        """Add an AI message to the history."""
        self.messages.append(AIMessage(content=content))

    def add_user_message(self, content: str) -> None:
        """Add a user message to the history."""
        self.messages.append(HumanMessage(content=content))

    def clear(self) -> None:
        """Clear all messages from the history."""
        self.messages = []

    async def aget_messages(self) -> list[BaseMessage]:
        """Async method to get messages (required by LangChain)."""
        return self.messages

    async def aadd_messages(self, messages: list[BaseMessage]) -> None:
        """Async method to add messages (required by LangChain)."""
        self.messages.extend(messages)

from uuid import uuid4

# In-memory stores that can be replaced by a database layer
_error_context_store = {}
_session_store = {}

# --- Tutor Error Context ---
def store_error_context(session_id: str, context: dict):
    _error_context_store[session_id] = context
    logger.info(f"Stored error context for session '{session_id}'.")

def pop_error_context(session_id: str) -> dict | None:
    context = _error_context_store.pop(session_id, None)
    if context:
        logger.info(f"Retrieved and cleared error context for session '{session_id}'.")
    return context

# --- Debugger Session History ---
def get_session_history(session_id: str) -> ChatMessageHistory:
    """Gets or creates a LangChain ChatMessageHistory object for a session."""
    if session_id not in _session_store:
        logger.info(f"Creating new chat history for session '{session_id}'.")
        _session_store[session_id] = ChatMessageHistory()
    return _session_store[session_id]

def get_active_sessions() -> dict:
    """Returns information about active sessions."""
    return {
        session_id: {"message_count": len(history.messages)}
        for session_id, history in _session_store.items()
    }

def clear_session_history(session_id: str):
    """Clears the history for a specific session."""
    if session_id in _session_store:
        _session_store[session_id].clear()
        logger.info(f"Cleared chat history for session '{session_id}'.")

# --- Session ID Management ---
async def get_or_create_session_id(context) -> str:
    session_id = context.globalState.get('sessionId')
    if not session_id:
        session_id = str(uuid4())
        await context.globalState.update('sessionId', session_id)
        logger.info(f"Created new session ID: {session_id}")
    else:
        logger.info(f"Retrieved existing session ID: {session_id}")
    return session_id

