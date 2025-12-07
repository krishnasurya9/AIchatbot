import fitz # PyMuPDF
from typing import List, Dict, Union
from backend.app.logger import logger

async def process_pdf(content: bytes, file_name: str) -> List[Dict[str, Union[str, dict]]]:
    chunks = []
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        for page_num, page in enumerate(doc):
            text = page.get_text("text")
            if text.strip():
                chunks.append({
                    "content": text,
                    "metadata": {
                        "file_name": file_name,
                        "file_type": ".pdf",
                        "page_number": page_num + 1,
                        "chunk_type": "text"
                    }
                })
        doc.close()
        return chunks
    except Exception as e:
        logger.error(f"Error processing PDF {file_name}: {e}", exc_info=True)
        return []
