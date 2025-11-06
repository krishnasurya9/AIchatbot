from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.app.services import tutor
from backend.app.memory import store_error_context

router = APIRouter()

class ErrorPayload(BaseModel):
    sessionId: str
    errorMessage: str
    file: str
    line: int
    severity: str

class TutorRequest(BaseModel):
    sessionId: str
    question: str

@router.post("/errors", status_code=202, summary="Receive Error Context from IDE")
async def receive_error_context(payload: ErrorPayload):
    store_error_context(payload.sessionId, payload.dict())
    return {"status": "accepted", "message": "Error context received and stored."}

@router.post("/", summary="Get Tutoring Assistance")
async def handle_tutor_request(req: TutorRequest):
    try:
        response = await tutor.get_tutor_response(
            session_id=req.sessionId,
            question=req.question
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

