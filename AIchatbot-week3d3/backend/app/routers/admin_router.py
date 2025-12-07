from fastapi import APIRouter
from backend.app.config import settings
from backend.app.logger import logger

router = APIRouter(prefix="/api/debug")

@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service_name": settings.app_name,
        "version": "2.0.0"
    }

@router.get("/logs")
async def get_logs():
    try:
        with open(settings.log_file, 'r') as f:
            lines = f.readlines()
            return {"logs": lines[-100:]}
    except FileNotFoundError:
        return {"logs": ["Log file not found."]}

