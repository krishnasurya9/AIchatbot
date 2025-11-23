from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from backend.app.services import tutor

router = APIRouter(prefix="/api/tutor", tags=["Tutor"])

class TutorInput(BaseModel):
    session_id: str
    message: Optional[str] = None
    query: Optional[str] = None
    mode: Optional[str] = None

@router.post("/chat")
async def tutor_chat(
    payload: TutorInput,
    use_rag: Optional[bool] = True
):
    question = payload.message or payload.query or ""
    return await tutor.get_tutor_response(
        session_id=payload.session_id,
        question=question,
        use_rag=use_rag,
        mode=payload.mode
    )
