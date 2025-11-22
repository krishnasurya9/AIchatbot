from fastapi import APIRouter
from backend.app.config import settings
from backend.app.logger import logger

router = APIRouter()

@router.get("/health", summary="Health Check")
async def health_check():
    return {
        "status": "ok",
        "service_name": settings.app_name,
        "version": "2.0.0"
    }

@router.get("/logs", summary="Get Recent Application Logs")
async def get_logs():
    try:
        with open(settings.log_file, 'r') as f:
            lines = f.readlines()
            return {"logs": lines[-100:]} # Return last 100 lines
    except FileNotFoundError:
        return {"logs": ["Log file not found."]}

