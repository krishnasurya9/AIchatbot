import pandas as pd
from io import BytesIO, StringIO
from typing import List, Dict, Union
from app.logger import logger

async def process_data(content: bytes, file_name: str, file_type: str) -> List[Dict[str, Union[str, dict]]]:
    chunks = []
    try:
        if file_type == ".csv":
            df = pd.read_csv(BytesIO(content))
        elif file_type == ".xlsx":
            df = pd.read_excel(BytesIO(content))
        else:
            return []

        buffer = StringIO()
        df.info(buf=buffer)
        schema = buffer.getvalue()
        
        chunks.append({
            "content": f"Schema:\n{schema}\n\nSample:\n{df.head().to_string()}",
            "metadata": {"file_name": file_name, "file_type": file_type, "chunk_type": "summary"}
        })
        return chunks
    except Exception as e:
        logger.error(f"Error processing data file {file_name}: {e}", exc_info=True)
        return []
