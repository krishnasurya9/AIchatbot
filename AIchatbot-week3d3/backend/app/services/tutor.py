import json
from app.logger import logger
from app.memory import pop_error_context
from app.llm.model_loader import get_gemini_model
from app.services import rag

DEBUG_PROMPT = """You are an AI coding tutor helping a user with a specific error.
Format response as JSON: "explanation", "stepsToFix" (array), "resources" (array of URLs).
Base your answer *primarily* on the 'Relevant Context' provided.
Cite sources using [filename] notation.

Relevant Context:
{context}

ERROR CONTEXT: {error_context}
USER QUESTION: {question}"""

TUTOR_PROMPT = """You are an AI coding tutor answering a general question.
Format response as JSON: "explanation", "stepsToFix" (empty array), "resources" (array of URLs).
Base your answer *primarily* on the 'Relevant Context' provided.
Cite sources using [filename] notation.

Relevant Context:
{context}

USER QUESTION: {question}"""

async def get_tutor_response(session_id: str, question: str, use_rag: bool = True, mode: str | None = None) -> dict:
    error_context = pop_error_context(session_id)
    
    context_str = "(No relevant documents found.)"
    if use_rag:
        rag_query = question + (f"\nError: {json.dumps(error_context)}" if error_context else "")
        _, context_chunks = await rag.retrieve_context_multi_source(query=rag_query, session_id=session_id)
        
        if context_chunks:
            context_str = ""
            for chunk in context_chunks:
                meta = chunk.get('metadata', {})
                context_str += f"\n📄 From: [{meta.get('file_name', 'Unknown')}]\n{chunk.get('content')}\n--------------------\n"

    if error_context:
        base = DEBUG_PROMPT
    else:
        base = TUTOR_PROMPT

    if (mode or '').lower() == 'deep':
        prompt = base + "\nProvide a thorough, step-by-step explanation. Prefer detailed reasoning."
    else:
        prompt = base + "\nProvide a concise answer optimized for speed."

    if error_context:
        prompt = prompt.format(context=context_str, error_context=json.dumps(error_context), question=question)
    else:
        prompt = prompt.format(context=context_str, question=question)
        
    return await _call_llm(prompt)

async def _call_llm(prompt: str) -> dict:
    """Calls the Gemini model and parses the JSON response."""
    client = get_gemini_model()
    if not client:
        logger.warning("AI model not configured. Returning mock response.")
        return {"explanation": "Mock response: AI Tutor not configured.", "stepsToFix": [], "resources": []}
    
    try:
        # Use the async wrapper's ainvoke method
        response = await client.ainvoke(prompt)
        
        # The response from genai is in the `text` attribute
        # The model is instructed to return JSON, so we parse it.
        # Added cleanup to handle markdown code blocks in the response
        response_text = response.text.strip().replace("```json", "").replace("```", "").strip()
        
        return json.loads(response_text)

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON from Gemini response: {e}")
        logger.error(f"Raw response was: {response.text}")
        # Return a structured error to the client
        return {
            "error": "Failed to parse AI response",
            "details": "The AI model returned a malformed JSON object.",
            "raw_response": response.text
        }
    except Exception as e:
        logger.error(f"Error calling Gemini AI: {e}", exc_info=True)
        # Propagate a generic error to the client
        raise Exception("Failed to communicate with the Tutor AI model.") from e
