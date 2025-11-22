from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from typing import List, Optional
import uuid
from backend.app.services import rag
from backend.app.models.schemas import RAGQuery, RAGUploadResponse, RAGQueryResponse, RAGStatusResponse, RAGDeleteResponse
from backend.app.config import settings

router = APIRouter(
    prefix="/api/rag",
    tags=["RAG"]
)

# A simple in-memory store for upload status.
# For production, use Redis or MongoDB.
upload_status_db = {}

@router.post("/upload", response_model=RAGUploadResponse, summary="Upload a file for RAG ingestion")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    is_shared: bool = Form(False)
):
    """
    Accepts a file and ingests it into the RAG system.
    Processing is done in the background.
    """
    if file.filename.split('.')[-1].lower() not in [ft.lstrip('.') for ft in settings.ALLOWED_FILE_TYPES]:
        raise HTTPException(status_code=400, detail="File type not allowed")
    
    file_id = str(uuid.uuid4())
    file_content = await file.read()
    
    # Store initial status
    upload_status_db[file_id] = {
        "file_id": file_id,
        "file_name": file.filename,
        "status": "processing",
        "chunks_created": 0
    }

    # Add ingestion task to background
    background_tasks.add_task(
        rag.ingest_file,
        file_id=file_id,
        file_name=file.filename,
        file_content=file_content,
        session_id=session_id,
        is_shared=is_shared,
        status_dict=upload_status_db
    )
    
    return {"file_id": file_id, "file_name": file.filename, "status": "processing"}


@router.get("/upload/status/{file_id}", response_model=RAGStatusResponse, summary="Check file processing status")
async def get_upload_status(file_id: str):
    """
    Checks the ingestion status of a file using its file_id.
    """
    status = upload_status_db.get(file_id)
    if not status:
        raise HTTPException(status_code=404, detail="File ID not found")
    return status


@router.post("/query", response_model=RAGQueryResponse, summary="Query the RAG system")
async def query_documents(query: RAGQuery):
    """
    Queries the RAG system with a question.
    - Retrieves relevant context from all indexed documents.
    - Synthesizes an answer using an LLM.
    - Returns the answer and the sources used.
    """
    answer, sources = await rag.query_rag_pipeline(
        query=query.question, 
        file_types=query.file_types, 
        session_id=query.session_id
    )
    return {"answer": answer, "sources": sources}


@router.delete("/files/{file_id}", response_model=RAGDeleteResponse, summary="Delete a file and its chunks")
async def delete_file_from_rag(file_id: str):
    """
    Removes a file and all its associated chunks from the
    vector database and file metadata store.
    """
    await rag.delete_file(file_id)
    if file_id in upload_status_db:
        del upload_status_db[file_id]
        
    return {"file_id": file_id, "status": "deleted"}
