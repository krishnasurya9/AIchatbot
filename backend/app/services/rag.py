from app.logger import logger
from app.utils import document_processor
from app.database.client import db_client
from app.llm.model_loader import get_gemini_model
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from typing import List, Dict, Optional, Any, Tuple

import google.generativeai as genai
import anyio
import re


EMBED_MODEL = "models/text-embedding-004"


# ==============================================================
# INGESTION
# ==============================================================

async def ingest_file(
    file_id: str,
    file_name: str,
    file_content: bytes,
    status_dict: dict,
    session_id: Optional[str] = None,
    is_shared: bool = False
):
    """
    STEP 4–COMPLIANT INGESTION PIPELINE
    Uses ONLY Gemini embed_content() for embeddings.
    """
    logger.info(f"[{file_id}] Starting ingestion for: {file_name}")

    try:
        chunks = await document_processor.process_file(file_name, file_content)

        if not chunks:
            status_dict[file_id] = {"status": "failed", "error": "No content extracted"}
            return

        # Produce text list
        texts = [c["content"] for c in chunks]

        # --- embedding function required by step 4 ---
        def embed_text(text: str):
            result = genai.embed_content(model=EMBED_MODEL, content=text)
            return result["embedding"]

        # generate embeddings
        embeddings = []
        for t in texts:
            emb = await anyio.to_thread.run_sync(lambda: embed_text(t))
            embeddings.append(emb)

        db = db_client.get_database()

        # store file metadata
        await db.file_metadata.insert_one({
            "_id": file_id,
            "file_name": file_name,
            "session_id": session_id,
            "is_shared": is_shared,
            "file_type": chunks[0]["metadata"].get("file_type"),
            "chunk_count": len(chunks)
        })

        # store chunks
        docs = []
        for i, chunk in enumerate(chunks):
            docs.append({
                "_id": f"{file_id}_chunk_{i}",
                "file_id": file_id,
                "session_id": session_id,
                "content": chunk["content"],
                "metadata": chunk["metadata"],
                "embedding": embeddings[i],
                "is_shared": is_shared
            })

        await db.all_chunks.insert_many(docs)

        status_dict[file_id] = {
            "status": "completed",
            "chunks_created": len(chunks)
        }

        logger.info(f"[{file_id}] Ingestion completed with {len(chunks)} chunks.")

    except Exception as e:
        logger.error(f"[{file_id}] Ingestion Error: {e}", exc_info=True)
        status_dict[file_id] = {"status": "failed", "error": str(e)}



# ==============================================================
# RETRIEVAL (MongoDB Atlas Vector Search)
# ==============================================================

async def retrieve_context_multi_source(
    query: str,
    file_types: Optional[List[str]] = None,
    session_id: Optional[str] = None
) -> Tuple[List[Dict], List[Dict]]:
    """
    STEP 4–COMPLIANT RETRIEVAL
    Query embedding created using SAME embed_content().
    """

    logger.info(f"Retrieving context for: {query}")

    db = db_client.get_database()

    # --- embed query exactly as ingestion ---
    def embed_q(text: str):
        result = genai.embed_content(model=EMBED_MODEL, content=text)
        return result["embedding"]

    query_vector = await anyio.to_thread.run_sync(lambda: embed_q(query))

    # --- vector search ---
    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 100,
                "limit": 20
            }
        }
    ]

    # Filters
    match_filter = {}

    if session_id:
        match_filter["$or"] = [
            {"session_id": session_id},
            {"is_shared": True}
        ]

    if file_types:
        match_filter["metadata.file_type"] = {"$in": file_types}

    if match_filter:
        pipeline.append({"$match": match_filter})

    pipeline.append({
        "$project": {
            "_id": 0,
            "content": 1,
            "metadata": 1,
            "score": {"$meta": "vectorSearchScore"}
        }
    })

    try:
        results = await db.all_chunks.aggregate(pipeline).to_list(20)
    except Exception as e:
        logger.error(f"Vector search failed: {e}", exc_info=True)
        # Fallback: Use text search for local MongoDB without Atlas
        logger.warning("Vector search unavailable (requires MongoDB Atlas). Falling back to text search.")
        
        # Build fallback query using text matching
        # Escape regex special characters to prevent regex errors
        escaped_query = re.escape(query)
        fallback_filter = {"content": {"$regex": escaped_query, "$options": "i"}}
        
        if session_id:
            fallback_filter["$or"] = [
                {"session_id": session_id},
                {"is_shared": True}
            ]
        
        if file_types:
            fallback_filter["metadata.file_type"] = {"$in": file_types}
        
        # Get documents matching the text search
        cursor = db.all_chunks.find(fallback_filter).limit(20)
        results = await cursor.to_list(20)
        
        # Add a simple relevance score based on keyword presence
        for r in results:
            # Count query word occurrences (simple scoring)
            query_words = query.lower().split()
            content_lower = r.get("content", "").lower()
            score = sum(content_lower.count(word) for word in query_words)
            r["score"] = score / 100.0  # Normalize score
        
        # If still no results, just get any recent chunks
        if not results:
            logger.warning("No text matches found. Returning recent documents.")
            cursor = db.all_chunks.find({}).sort("_id", -1).limit(5)
            results = await cursor.to_list(5)
            for r in results:
                r["score"] = 0.1  # Low default score

    # return top 5
    top = sorted(results, key=lambda x: x.get("score", 0), reverse=True)[:5]

    sources = []
    for r in top:
        meta = r.get("metadata", {})
        sources.append({
            "file": meta.get("file_name", "Unknown"),
            "content_snippet": r.get("content", "")[:200] + "...",
            "relevance_score": r.get("score", 0)
        })

    return sources, top



# ==============================================================
# RAG PIPELINE (LLM Answering)
# ==============================================================

async def query_rag_pipeline(query: str, file_types=None, session_id=None):
    sources, chunks = await retrieve_context_multi_source(query, file_types, session_id)

    if not chunks:
        return "No relevant information found.", []

    model = get_gemini_model()

    # build context string
    context_str = ""
    for i, c in enumerate(chunks):
        context_str += f"\n--- Source {i+1}: {c['metadata'].get('file_name')} ---\n"
        context_str += c["content"] + "\n--------------------------------------\n"

    template = """
    You must answer ONLY using the provided context.
    If the answer is not present in context say:
    "I could not find that information in the provided documents."

    Context:
    {context}

    Question:
    {question}

    Answer:
    """

    prompt = ChatPromptTemplate.from_template(template)

    chain = (
        {"context": lambda x: x["context"], "question": lambda x: x["question"]}
        | prompt
        | model
        | StrOutputParser()
    )

    answer = await chain.ainvoke({
        "context": context_str,
        "question": query
    })

    return answer, sources



# ==============================================================
# DELETE
# ==============================================================

async def delete_file(file_id: str):
    db = db_client.get_database()
    await db.file_metadata.delete_one({"_id": file_id})
    await db.all_chunks.delete_many({"file_id": file_id})
    logger.info(f"Deleted file {file_id}")
