import json
from app.logger import logger
from app.memory import pop_error_context
from app.llm.model_loader import get_together_ai_client
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

FAST_TUTOR_PROMPT = """You are an AI coding tutor. Give a concise, direct answer.
Format response as JSON: "explanation", "stepsToFix" (array), "resources" (array of URLs).
Keep explanations brief and actionable.

Relevant Context:
{context}

USER QUESTION: {question}"""

DEEP_TUTOR_PROMPT = """You are an AI coding tutor providing comprehensive educational guidance.
Format response as JSON: "explanation", "stepsToFix" (array), "resources" (array of URLs).
Provide detailed explanations, educational context, and thorough step-by-step guidance.
Base your answer *primarily* on the 'Relevant Context' provided.
Cite sources using [filename] notation.

Relevant Context:
{context}

USER QUESTION: {question}"""

async def get_tutor_response(session_id: str, question: str, use_rag: bool = True, mode: str = "deep") -> dict:
    """
    mode: "fast" for quick responses, "deep" for comprehensive tutoring
    """
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
        prompt = DEBUG_PROMPT.format(context=context_str, error_context=json.dumps(error_context), question=question)
    else:
        # Use mode to select prompt template
        if mode.lower() == "fast":
            prompt = FAST_TUTOR_PROMPT.format(context=context_str, question=question)
        else:  # deep or default
            prompt = DEEP_TUTOR_PROMPT.format(context=context_str, question=question)
        
    return await _call_llm(prompt)

async def _call_llm(prompt: str) -> dict:
    client = get_together_ai_client()
    if not client:
        return {"explanation": "Mock response: AI Tutor not configured.", "stepsToFix": [], "resources": []}
    
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
