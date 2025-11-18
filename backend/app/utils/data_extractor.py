import pandas as pd
from io import BytesIO, StringIO
from typing import List, Dict, Union
from app.logger import logger

async def process_data(content: bytes, file_name: str, file_type: str) -> List[Dict[str, Union[str, dict]]]:
    """
    Extracts schema, summary statistics, and sample rows from
    CSV or Excel files.
    """
    chunks = []
    try:
        if file_type == ".csv":
            df = pd.read_csv(BytesIO(content))
        elif file_type == ".xlsx":
            df = pd.read_excel(BytesIO(content))
        else:
            return []

        # Chunk 1: Schema and Summary Statistics
        schema_buffer = StringIO()
        df.info(verbose=True, buf=schema_buffer)
        schema = schema_buffer.getvalue()
        
        summary = "No numeric data for summary."
        if not df.select_dtypes(include='number').empty:
            summary = df.describe().to_string()
        
        chunks.append({
            "content": f"File Schema:\n{schema}\n\nSummary Statistics:\n{summary}",
            "metadata": {
                "file_name": file_name,
                "file_type": file_type,
                "chunk_type": "summary"
            }
        })

        # Chunk 2: Sample Rows
        sample_rows = df.head(5).to_string()
        chunks.append({
            "content": f"Sample Data (First 5 Rows):\n{sample_rows}",
            "metadata": {
                "file_name": file_name,
                "file_type": file_type,
                "chunk_type": "sample_rows"
            }
        })

        logger.info(f"Extracted {len(chunks)} data chunks from {file_name}")
        return chunks

    except Exception as e:
        logger.error(f"Error processing data file {file_name}: {e}", exc_info=True)
        return []
