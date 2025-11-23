import docx
from io import BytesIO
from typing import List, Dict, Union
from backend.app.logger import logger

async def process_docx(content: bytes, file_name: str) -> List[Dict[str, Union[str, dict]]]:
    chunks = []
    try:
        doc = docx.Document(BytesIO(content))
        current_heading = "None"
        
        for para in doc.paragraphs:
            if para.style.name.startswith('Heading'):
                current_heading = para.text.strip()
            elif para.text.strip():
                chunks.append({
                    "content": para.text.strip(),
                    "metadata": {
                        "file_name": file_name,
                        "file_type": ".docx",
                        "section": current_heading,
                        "chunk_type": "text"
                    }
                })
        return chunks
    except Exception as e:
        logger.error(f"Error processing DOCX {file_name}: {e}", exc_info=True)
        return []
