from backend.app.logger import logger
from backend.app.llm.model_loader import get_gemini_model
from backend.app.memory import get_session_history
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables.history import RunnableWithMessageHistory
from backend.app.services import rag

SYSTEM_PROMPT = (
    "You are a professional Coding Assistant powered by Gemini. "
    "Your expertise includes writing clean code, debugging, code review, API development, and more. "
    "First, analyze the user's question. Then, carefully review the 'Relevant Context' provided below. "
    "Base your answer *primarily* on this context if it is relevant. "
    "Cite the sources using [filename] or [filename (Page X)] notation."
    "\n\n"
    "Relevant Context:\n"
    "{context}"
    "\n\n"
    "Question: {question}"
)

async def get_chat_response(session_id: str, user_message: str, use_rag: bool = True) -> dict:
    model = get_gemini_model()
    if not model:
        return {"response": "Mock response: Debugger model is not configured."}

    try:
        context_str = "(RAG was disabled for this query.)"
        
        if use_rag:
            _, context_chunks = await rag.retrieve_context_multi_source(
                query=user_message,
                session_id=session_id 
            )
            
            if not context_chunks:
                context_str = "(No relevant documents found.)"
            else:
                context_str = ""
                for chunk in context_chunks:
                    meta = chunk.get('metadata', {})
                    name = meta.get('file_name', 'Unknown')
                    page = meta.get('page_number', '')
                    source_desc = f"[{name} p.{page}]" if page else f"[{name}]"
                    
                    context_str += f"\n📄 From: {source_desc}\n{chunk.get('content')}\n--------------------\n"

        prompt_template = ChatPromptTemplate.from_template(SYSTEM_PROMPT)

        conversation_with_history = RunnableWithMessageHistory(
            prompt_template | model,
            get_session_history,
            input_messages_key="question",
            history_messages_key="history",
        )

        response = await conversation_with_history.ainvoke(
            {"question": user_message, "context": context_str},
            config={"configurable": {"session_id": session_id}}
        )

        bot_reply = getattr(response, "content", str(response))
        return {"response": bot_reply, "session_id": session_id}

    except Exception as e:
        logger.error(f"Error invoking debugger chain: {e}", exc_info=True)
        raise Exception("Failed to communicate with the Debugger AI model.") from e
