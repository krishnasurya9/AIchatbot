from app.logger import logger
from app.model_loader import get_gemini_model
from app.memory import get_session_history
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables.history import RunnableWithMessageHistory

# System prompt from the original Flask backend
SYSTEM_PROMPT = (
    "You are a professional Coding Assistant powered by Gemini 2.0 Flash. "
    "Your expertise includes writing clean code, debugging, code review, API development, and more. "
    "Question: {question}"
)

prompt_template = ChatPromptTemplate.from_template(SYSTEM_PROMPT)

async def get_chat_response(session_id: str, user_message: str) -> dict:
    """Handles the chat logic using LangChain for the debugger."""
    model = get_gemini_model()
    if not model:
        return {"response": "Mock response: Debugger model is not configured."}

    try:
        # Create a conversation chain with memory for each request
        conversation_with_history = RunnableWithMessageHistory(
            prompt_template | model,
            get_session_history,
            input_messages_key="question",
            history_messages_key="history",
        )

        # Invoke the chain
        response = await conversation_with_history.ainvoke(
            {"question": user_message},
            config={"configurable": {"session_id": session_id}}
        )

        bot_reply = getattr(response, "content", str(response))
        return {"response": bot_reply, "session_id": session_id}

    except Exception as e:
        logger.error(f"Error invoking debugger chain: {e}", exc_info=True)
        raise Exception("Failed to communicate with the Debugger AI model.") from e

