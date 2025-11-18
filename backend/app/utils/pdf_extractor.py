import fitz # PyMuPDF
from typing import List, Dict, Union
from app.logger import logger

async def process_pdf(content: bytes, file_name: str) -> List[Dict[str, Union[str, dict]]]:
    """
    Extracts text from a PDF, chunking by page.
    
    Note: This implementaion is page-based. More advanced strategies 
    (font analysis for sections, semantic chunking) can be added.
    """
    chunks = []
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        
        for page_num, page in enumerate(doc):
            text = page.get_text("text")
            
            if text.strip(): # Only add non-empty pages
                chunk = {
                    "content": text,
                    "metadata": {
                        "file_name": file_name,
                        "file_type": ".pdf",
                        "page_number": page_num + 1,
                        "chunk_type": "text"
                    }
                }
                chunks.append(chunk)
        
        doc.close()
        logger.info(f"Extracted {len(chunks)} chunks from {file_name}")
        return chunks

    except Exception as e:
        logger.error(f"Error processing PDF {file_name}: {e}", exc_info=True)
        return []
