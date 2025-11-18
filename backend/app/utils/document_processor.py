import mimetypes
from fastapi import UploadFile
from app.utils import pdf_extractor, docx_extractor, text_splitter, data_extractor
# Assuming code_splitter.py exists from the previous specification
from app.utils import code_splitter 
from app.logger import logger
from app.config import settings
from typing import List, Dict, Union

async def process_file(file_name: str, file_content: bytes) -> List[Dict[str, Union[str, dict]]]:
    """
    Routes a file to the appropriate processor based on its extension.
    
    Args:
        file_name: The name of the file (e.g., "doc.pdf").
        file_content: The raw bytes of the file.

    Returns:
        A list of document chunk dictionaries.
    """
    logger.info(f"Processing file: {file_name}")
    
    # Determine file type from extension
    suffix = file_name.split('.')[-1].lower()
    file_type = f".{suffix}"

    if file_type not in settings.ALLOWED_FILE_TYPES:
        logger.warning(f"Unsupported file type: {file_type}")
        raise ValueError(f"Unsupported file type: {file_type}")

    content_str = None # For text-based processors

    # Route to the correct processor
    try:
        if file_type == '.pdf':
            return await pdf_extractor.process_pdf(file_content, file_name)
        
        elif file_type == '.docx':
            return await docx_extractor.process_docx(file_content, file_name)

        elif file_type in ['.txt', '.md']:
            try:
                content_str = file_content.decode('utf-8')
            except UnicodeDecodeError:
                content_str = file_content.decode('latin-1')
            return await text_splitter.process_text(content_str, file_name, file_type)

        elif file_type in ['.csv', '.xlsx']:
            return await data_extractor.process_data(file_content, file_name, file_type)
        
        elif file_type in ['.py', '.js', '.java', '.cpp']: # Add all supported code types
            try:
                content_str = file_content.decode('utf-8')
            except UnicodeDecodeError:
                content_str = file_content.decode('latin-1')
            # Assuming code_splitter.process exists and returns the correct format
            return await code_splitter.process(content_str, file_name, file_type)

        else:
            logger.error(f"No processor found for file type: {file_type}")
            raise ValueError(f"No processor found for file type: {file_type}")

    except Exception as e:
        logger.error(f"Failed to process {file_name}: {e}", exc_info=True)
        raise Exception(f"Failed to process {file_name}")
