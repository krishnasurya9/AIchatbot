from backend.app.logger import logger
from backend.app.utils import document_processor
from backend.app.database.client import db_client
from backend.app.llm.model_loader import get_embedding_model, get_gemini_model # Assuming you have these
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from typing import List, Dict, Optional, Any, Tuple

# --- Ingestion ---

async def ingest_file(
    file_id: str,
    file_name: str,
    file_content: bytes,
    status_dict: dict,
    session_id: Optional[str] = None,
    is_shared: bool = False
):
    """
    Main ingestion pipeline: process file, get chunks, create embeddings, and store.
    """
    logger.info(f"[{file_id}] Starting ingestion for: {file_name}")
    try:
        # 1. Process file to get chunks
        chunks = await document_processor.process_file(file_name, file_content)
        if not chunks:
            logger.warning(f"[{file_id}] No chunks extracted from {file_name}.")
            status_dict[file_id].update({"status": "failed", "error": "No content extracted"})
            return

        # 2. Get embedding model
        embed_model = get_embedding_model() # Assumes this returns a LangChain-compatible embedder
        if not embed_model:
            raise Exception("Embedding model is not configured")

        # 3. Generate embeddings for chunks
        contents = [chunk['content'] for chunk in chunks]
        embeddings = await embed_model.aembed_documents(contents)

        # 4. Prepare documents for MongoDB
        db = db_client.get_database()
        chunk_documents = []
        for i, chunk in enumerate(chunks):
            chunk_documents.append({
                "_id": f"{file_id}_chunk_{i}",
                "file_id": file_id,
                "session_id": session_id,
                "content": chunk['content'],
                "metadata": chunk['metadata'],
                "embedding": embeddings[i]
            })
        
        # 5. Store file metadata
        await db.file_metadata.insert_one({
            "_id": file_id,
            "file_name": file_name,
            "session_id": session_id,
            "is_shared": is_shared,
            "file_type": chunks[0]['metadata'].get('file_type', 'unknown'),
            "chunk_count": len(chunks)
        })

        # 6. Store chunks in one collection for unified search
        await db.all_chunks.insert_many(chunk_documents)
        
        # 7. Update status
        status_dict[file_id].update({"status": "completed", "chunks_created": len(chunks)})
        logger.info(f"[{file_id}] Successfully ingested {file_name} with {len(chunks)} chunks.")

    except Exception as e:
        logger.error(f"[{file_id}] Ingestion failed for {file_name}: {e}", exc_info=True)
        status_dict[file_id].update({"status": "failed", "error": str(e)})

# --- Retrieval ---

async def retrieve_context_multi_source(
    query: str, 
    file_types: Optional[List[str]] = None, 
    session_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Retrieves context using MongoDB Atlas Vector Search.
    
    This requires a Vector Search Index in your MongoDB Atlas deployment.
    """
    logger.info(f"Retrieving context for query: '{query}'")
    db = db_client.get_database()
    embed_model = get_embedding_model()
    
    # 1. Generate query embedding
    query_embedding = await embed_model.aembed_query(query)
    
    # 2. Build the $vectorSearch pipeline
    search_stage = {
        "$vectorSearch": {
            "index": "vector_index", # REPLACE with your Atlas Vector Search index name
            "path": "embedding",
            "queryVector": query_embedding,
            "numCandidates": 100,
            "limit": 20 # Get 20 candidates for re-ranking
        }
    }
    
    # 3. Build filters (pre-filter)
    # Note: $vectorSearch filtering is more complex. We'll post-filter for simplicity here.
    # A proper implementation would use the "filter" field in $vectorSearch.
    
    pipeline = [search_stage]
    
    # Add filtering logic
    match_filter = {}
    if session_id:
        # Filter for user's private files OR shared files
        match_filter["$or"] = [
            {"session_id": session_id},
            {"is_shared": True}
        ]
    if file_types:
        match_filter["metadata.file_type"] = {"$in": file_types}

    if match_filter:
        pipeline.append({"$match": match_filter})

    # Add projection to get metadata and score
    pipeline.append({
        "$project": {
            "_id": 0,
            "content": 1,
            "metadata": 1,
            "score": {"$meta": "vectorSearchScore"}
        }
    })
    
    # 4. Execute search
    try:
        results = await db.all_chunks.aggregate(pipeline).to_list(length=20)
    except Exception as e:
        logger.error(f"Vector search failed: {e}. Do you have a 'vector_index' setup in Atlas?", exc_info=True)
        return [],[]

    # 5. TODO: Re-rank with FlashRank (as specified in your doc)
    # For now, we just take the top 5
    
    top_results = sorted(results, key=lambda x: x['score'], reverse=True)[:5]

    # 6. Format for output
    sources = []
    for res in top_results:
        meta = res['metadata']
        source_entry = {
            "file": meta.get('file_name', 'Unknown'),
            "content_snippet": res['content'][:150] + "...",
            "relevance_score": res['score'],
            # Add specific metadata
            "page": meta.get('page_number'),
            "function": meta.get('function_name'), # From code_splitter
            "section": meta.get('section') # From docx/md
        }
        # Clean up nulls
        source_entry = {k: v for k, v in source_entry.items() if v is not None}
        sources.append(source_entry)

    return sources, top_results # Return both formatted sources and full chunks

# --- Query Pipeline ---

async def query_rag_pipeline(
    query: str, 
    file_types: Optional[List[str]] = None, 
    session_id: Optional[str] = None
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Full RAG pipeline: Retrieve context, build prompt, and get LLM answer.
    """
    formatted_sources, context_chunks = await retrieve_context_multi_source(query, file_types, session_id)
    
    if not context_chunks:
        return "I couldn't find any relevant information in your documents to answer that question.", []

    model = get_gemini_model() # Or any other model
    if not model:
        return "RAG model is not configured.", formatted_sources

    # Build context string
    context_str = ""
    for i, chunk in enumerate(context_chunks):
        context_str += f"--- Source {i+1} ({chunk['metadata'].get('file_name')}) ---\n"
        context_str += chunk['content']
        context_str += "\n--------------------------------------------------\n\n"
    
    template = """
    You are an AI assistant. Answer the user's question based *only* on the
    provided context from their documents.
    
    If the context doesn't contain the answer, say "I'm sorry, but I
    couldn't find the answer to your question in the provided documents."
    
    Cite the sources you used in your answer using [Source X] notation,
    referring to the source number.
    
    Context:
    {context}
    
    Question:
    {question}
    
    Answer:
    """
    
    prompt = ChatPromptTemplate.from_template(template)
    
    chain = (
        {"context": lambda x: x['context'], "question": lambda x: x['question']}
        | prompt
        | model
        | StrOutputParser()
    )
    
    answer = await chain.ainvoke({"context": context_str, "question": query})
    
    return answer, formatted_sources


# --- Deletion ---

async def delete_file(file_id: str):
    """
    Removes a file and all its chunks from MongoDB.
    """
    logger.info(f"Deleting file and chunks for file_id: {file_id}")
    db = db_client.get_database()
    
    # Delete metadata
    meta_result = await db.file_metadata.delete_one({"_id": file_id})
    
    # Delete all associated chunks
    chunk_result = await db.all_chunks.delete_many({"file_id": file_id})
    
    logger.info(f"Deleted {meta_result.deleted_count} metadata entries and {chunk_result.deleted_count} chunks.")
    return
