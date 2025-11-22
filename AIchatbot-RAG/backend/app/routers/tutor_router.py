from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from backend.app.services import tutor

router = APIRouter(prefix="/tutor", tags=["Tutor"])

class TutorInput(BaseModel):
    session_id: str
    message: str

@router.post("/chat")
async def tutor_chat(
    payload: TutorInput,
    use_rag: Optional[bool] = True
):
    return await tutor.get_tutor_response(
        session_id=payload.session_id,
        question=payload.message,
        use_rag=use_rag
    )
