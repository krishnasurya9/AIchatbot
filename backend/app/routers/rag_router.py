from fastapi import APIRouter
from backend.app.services import rag

router = APIRouter()

@router.get("/query", summary="Query the RAG knowledge base")
async def query_documents(q: str):
    results = await rag.query_rag(q)
    return {"query": q, "results": results}

