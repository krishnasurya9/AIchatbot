from langchain.text_splitter import RecursiveCharacterTextSplitter, Language
from typing import List, Dict, Union
from app.logger import logger

async def process(content: str, file_name: str, file_type: str) -> List[Dict[str, Union[str, dict]]]:
    lang = Language.PYTHON if file_type == ".py" else Language.JS if file_type == ".js" else None
    
    if lang:
        splitter = RecursiveCharacterTextSplitter.from_language(language=lang, chunk_size=1500, chunk_overlap=200)
    else:
        splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
        
    docs = splitter.create_documents([content])
    
    chunks = []
    for doc in docs:
        meta = {"file_name": file_name, "file_type": file_type, **doc.metadata}
        chunks.append({"content": doc.page_content, "metadata": meta})
    
    return chunks
