import docx
from io import BytesIO
from typing import List, Dict, Union
from app.logger import logger

async def process_docx(content: bytes, file_name: str) -> List[Dict[str, Union[str, dict]]]:
    """
    Extracts text from DOCX documents, grouping by paragraphs
    and noting heading-based sections.
    """
    chunks = []
    try:
        doc = docx.Document(BytesIO(content))
        current_heading = "None"
        
        for para in doc.paragraphs:
            if para.style.name.startswith('Heading'):
                current_heading = para.text.strip()
            elif para.text.strip():
                chunk_content = para.text.strip()
                chunks.append({
                    "content": chunk_content,
                    "metadata": {
                        "file_name": file_name,
                        "file_type": ".docx",
                        "section": current_heading,
                        "chunk_type": "text"
                    }
                })
        
        # Basic table extraction (as text)
        for table in doc.tables:
            table_content = []
            for row in table.rows:
                row_text = [cell.text.strip() for cell in row.cells]
                table_content.append(" | ".join(row_text))
            
            if table_content:
                chunks.append({
                    "content": "\n".join(table_content),
                    "metadata": {
                        "file_name": file_name,
                        "file_type": ".docx",
                        "section": current_heading,
                        "chunk_type": "table"
                    }
                })

        logger.info(f"Extracted {len(chunks)} chunks from {file_name}")
        return chunks

    except Exception as e:
        logger.error(f"Error processing DOCX {file_name}: {e}", exc_info=True)
        return []
