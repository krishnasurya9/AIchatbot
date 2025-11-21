from fastapi import APIRouter
from pydantic import BaseModel
from app.services.llm_service import query_llm

router = APIRouter(prefix="/tutor", tags=["Tutor"])

class TutorInput(BaseModel):
    query: str

@router.post("/chat")
async def tutor_chat(payload: TutorInput):
    return await query_llm(payload.query, "tutor")
