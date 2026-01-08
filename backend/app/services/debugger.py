from app.logger import logger
from app.llm.model_loader import get_gemini_model
from app.memory import get_session_history
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from app.services import rag

SYSTEM_PROMPT = (
    "You are a professional Coding Assistant powered by Gemini. "
    "Your expertise includes writing clean code, debugging, code review, API development, and more. "
    "First, analyze the user's question. Then, carefully review the 'Relevant Context' provided below. "
    "Base your answer *primarily* on this context if it is relevant. "
    "Cite the sources using [filename] or [filename (Page X)] notation."
    "\n\n"
    "Relevant Context:\n"
    "{context}"
)

async def get_chat_response(session_id: str, user_message: str, use_rag: bool = True, mode: str | None = None) -> dict:
    model = get_gemini_model()
    if not model:
        return {"response": "Mock response: Debugger model is not configured."}

    try:
        context_str = "(RAG was disabled for this query.)"
        
        if use_rag:
            try:
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
            except Exception as e:
                logger.error(f"Error retrieving RAG context: {e}")
                context_str = "(Error retrieving relevant documents. Proceeding without context.)"

        prompt_text = SYSTEM_PROMPT
        if (mode or '').lower() == 'deep':
            prompt_text += "\nUse comprehensive reasoning and suggest multiple options."
        else:
            prompt_text += "\nKeep the answer brief and pragmatic."

        prompt_text_final = prompt_text.format(context=context_str)
        
        prompt_template = ChatPromptTemplate.from_messages([
            ("system", prompt_text_final),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{question}")
        ])

        conversation_with_history = RunnableWithMessageHistory(
            prompt_template | model,
            get_session_history,
            input_messages_key="question",
            history_messages_key="history",
        )

        response = await conversation_with_history.ainvoke(
            {"question": user_message},
            config={"configurable": {"session_id": session_id}}
        )

        bot_reply = getattr(response, "content", str(response))
        return {"response": bot_reply, "session_id": session_id}

    except Exception as e:
        with open("debug_error.log", "w") as f:
            f.write(f"CRITICAL ERROR IN DEBUGGER: {e}\n")
            import traceback
            traceback.print_exc(file=f)
            
        logger.error(f"Error invoking debugger chain: {e}", exc_info=True)
        raise Exception("Failed to communicate with the Debugger AI model.") from e
