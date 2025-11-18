from app.logger import logger
from app.model_loader import get_gemini_model
from app.memory import get_session_history
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables.history import RunnableWithMessageHistory
from app.services import rag # Import the RAG service

# System prompt from the original Flask backend
SYSTEM_PROMPT = (
    "You are a professional Coding Assistant powered by Gemini. "
    "Your expertise includes writing clean code, debugging, code review, API development, and more. "
    "First, analyze the user's question. Then, carefully review the
    'Relevant Context' provided from their documents and code. "
    "Base your answer *primarily* on this context. "
    "Cite the sources using [filename] or [filename (Page X)] notation."
    "\n"
    "Relevant Context:\n"
    "{context}"
    "\n"
    "Question: {question}"
)

async def get_chat_response(session_id: str, user_message: str) -> dict:
    """Handles the chat logic using LangChain for the debugger."""
    model = get_gemini_model()
    if not model:
        return {"response": "Mock response: Debugger model is not configured."}

    try:
        # --- NEW RAG Integration ---
        # 1. Retrieve context from RAG service
        # We pass the session_id to filter for the user's files
        _, context_chunks = await rag.retrieve_context_multi_source(
            query=user_message,
            session_id=session_id 
        )
        
        # 2. Build the enriched prompt context
        context_str = ""
        if not context_chunks:
            context_str = "(No relevant documents found.)"
        else:
            for chunk in context_chunks:
                meta = chunk.get('metadata', {})
                source_name = meta.get('file_name', 'Unknown')
                page = meta.get('page_number')
                func = meta.get('function_name')
                section = meta.get('section')
                
                source_desc = f"[{source_name}"
                if page: source_desc += f" (Page {page})"
                if func: source_desc += f" (Function: {func})"
                if section: source_desc += f" (Section: {section})"
                source_desc += "]"
                
                context_str += f"\n📄 From: {source_desc}\n"
                context_str += chunk.get('content')
                context_str += "\n--------------------\n"
        # --- End RAG Integration ---

        # Create a conversation chain with memory for each request
        prompt_template = ChatPromptTemplate.from_template(SYSTEM_PROMPT)

        conversation_with_history = RunnableWithMessageHistory(
            prompt_template | model,
            get_session_history,
            input_messages_key="question",
            history_messages_key="history",
        )

        # Invoke the chain with the new context and question
        response = await conversation_with_history.ainvoke(
            {"question": user_message, "context": context_str},
            config={"configurable": {"session_id": session_id}}
        )

        bot_reply = getattr(response, "content", str(response))
        return {"response": bot_reply, "session_id": session_id}

    except Exception as e:
        logger.error(f"Error invoking debugger chain: {e}", exc_info=True)
        raise Exception("Failed to communicate with the Debugger AI model.") from e
