import json
from app.logger import logger
from app.memory import pop_error_context
from app.model_loader import get_together_ai_client

# Prompt templates from the VS Code backend
DEBUG_PROMPT = """You are an AI coding tutor helping a user with a specific error.
Format your response as a valid JSON object with ONLY the following keys: "explanation", "stepsToFix" (as an array of strings), and "resources" (as an array of relevant URLs).
ERROR CONTEXT: {error_context}
USER QUESTION: {question}"""

TUTOR_PROMPT = """You are an AI coding tutor answering a general question.
Format your response as a valid JSON object with ONLY the following keys: "explanation", "stepsToFix" (as an empty array), and "resources" (as an array of relevant URLs).
USER QUESTION: {question}"""

async def get_tutor_response(session_id: str, question: str) -> dict:
    error_context = pop_error_context(session_id)
    
    if error_context:
        prompt = DEBUG_PROMPT.format(
            error_context=json.dumps(error_context, indent=2),
            question=question
        )
    else:
        prompt = TUTOR_PROMPT.format(question=question)
        
    return await _call_llm(prompt)

async def _call_llm(prompt: str) -> dict:
    client = get_together_ai_client()
    if not client:
        return {
            "explanation": "Mock response: AI Tutor is not configured.",
            "stepsToFix": ["Set TOGETHER_API_KEY in .env"],
            "resources": []
        }
    
    try:
        response = client.chat.completions.create(
            model="mistralai/Mixtral-8x7B-Instruct-v0.1",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error(f"Error calling Together AI: {e}", exc_info=True)
        raise Exception("Failed to communicate with the Tutor AI model.") from e

