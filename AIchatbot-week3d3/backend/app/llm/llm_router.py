from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.llm.model_loader import get_together_ai_client, get_gemini_model
from app.logger import logger

router = APIRouter()

class LLMRequest(BaseModel):
    prompt: str
    model: str = "gemini"  # default model

class LLMResponse(BaseModel):
    reply: str

@router.post("/llm/chat", response_model=LLMResponse)
async def llm_chat(req: LLMRequest):
    """
    Universal chat endpoint for multiple LLMs.
    model="together" → Together AI
    model="gemini"   → Google Gemini
    """
    try:
        if req.model.lower() == "together":
            client = get_together_ai_client()
            if not client:
                raise ValueError("Together AI client not initialized.")
            response = client.chat.completions.create(
                model="meta-llama/Llama-3-8b-chat-hf",
                messages=[{"role": "user", "content": req.prompt}],
            )
            reply = response.output_text

        elif req.model.lower() == "gemini":
            model = get_gemini_model()
            if not model:
                raise ValueError("Gemini model not initialized.")
            response = model.invoke(req.prompt)
            reply = response.content if hasattr(response, "content") else str(response)

        else:
            raise ValueError(f"Unsupported model type: {req.model}")

        return {"reply": reply}

    except Exception as e:
        logger.error(f"Error in /llm/chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))
