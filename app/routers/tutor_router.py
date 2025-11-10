from fastapi import APIRouter
from pydantic import BaseModel
from app.services.llm_service import sanitize_input, query_llm

router = APIRouter(prefix="/tutor", tags=["Tutor"])

class TutorInput(BaseModel):
    query: str

@router.post("/chat")
async def tutor_chat(payload: TutorInput):
    q = sanitize_input(payload.query)
    return await query_llm(q, "tutor")

