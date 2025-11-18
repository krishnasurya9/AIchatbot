from langchain.text_splitter import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from typing import List, Dict, Union
from app.config import settings
from app.logger import logger

async def process_text(content: str, file_name: str, file_type: str) -> List[Dict[str, Union[str, dict]]]:
    """
    Splits plain text or Markdown into semantic chunks.
    """
    chunks = []
    docs = []

    if file_type == ".md":
        headers_to_split_on = [
            ("#", "Header 1"),
            ("##", "Header 2"),
            ("###", "Header 3"),
        ]
        md_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)
        docs = md_splitter.split_text(content)
        # Docs are now split by headers, but might still be too large
    else:
        # For plain text, treat the whole file as one document
        docs = [Document(page_content=content, metadata={})]

    # Further split large chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.TEXT_CHUNK_SIZE,
        chunk_overlap=settings.TEXT_OVERLAP
    )
    
    split_docs = text_splitter.split_documents(docs)

    for doc in split_docs:
        final_metadata = {
            "file_name": file_name,
            "file_type": file_type,
            **doc.metadata
        }
        # Clean up metadata keys if needed
        if 'Header 1' in final_metadata:
            final_metadata['section'] = final_metadata.pop('Header 1')
        if 'Header 2' in final_metadata:
            final_metadata['section'] = final_metadata.pop('Header 2')
        if 'Header 3' in final_metadata:
            final_metadata['section'] = final_metadata.pop('Header 3')

        chunks.append({
            "content": doc.page_content,
            "metadata": final_metadata
        })

    logger.info(f"Split {file_name} into {len(chunks)} chunks.")
    return chunks
