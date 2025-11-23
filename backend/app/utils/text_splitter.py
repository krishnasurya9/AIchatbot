from langchain.text_splitter import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from typing import List, Dict, Union
from app.config import settings
from app.logger import logger

async def process_text(content: str, file_name: str, file_type: str) -> List[Dict[str, Union[str, dict]]]:
    chunks = []
    docs = []

    if file_type == ".md":
        headers = [("#", "Header 1"), ("##", "Header 2"), ("###", "Header 3")]
        md_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers)
        docs = md_splitter.split_text(content)
    else:
        docs = [Document(page_content=content, metadata={})]

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.TEXT_CHUNK_SIZE,
        chunk_overlap=settings.TEXT_OVERLAP
    )
    split_docs = text_splitter.split_documents(docs)

    for doc in split_docs:
        meta = {"file_name": file_name, "file_type": file_type, **doc.metadata}
        chunks.append({"content": doc.page_content, "metadata": meta})

    return chunks
