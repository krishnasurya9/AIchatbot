from app.logger import logger
from langchain_community.chat_message_histories import ChatMessageHistory

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

