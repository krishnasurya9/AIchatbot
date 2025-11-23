import mimetypes
from app.utils import pdf_extractor, docx_extractor, text_splitter, data_extractor, code_splitter
from app.logger import logger
from app.config import settings
from typing import List, Dict, Union

async def process_file(file_name: str, file_content: bytes) -> List[Dict[str, Union[str, dict]]]:
    """
    Routes a file to the appropriate processor based on its extension.
    """
    logger.info(f"Processing file: {file_name}")
    
    suffix = file_name.split('.')[-1].lower()
    file_type = f".{suffix}"

    if file_type not in settings.ALLOWED_FILE_TYPES:
        raise ValueError(f"Unsupported file type: {file_type}")

    try:
        if file_type == '.pdf':
            return await pdf_extractor.process_pdf(file_content, file_name)
        
        elif file_type == '.docx':
            return await docx_extractor.process_docx(file_content, file_name)

        elif file_type in ['.txt', '.md']:
            content_str = _decode_content(file_content)
            return await text_splitter.process_text(content_str, file_name, file_type)

        elif file_type in ['.csv', '.xlsx']:
            return await data_extractor.process_data(file_content, file_name, file_type)
        
        elif file_type in ['.py', '.js', '.java', '.cpp']:
            content_str = _decode_content(file_content)
            return await code_splitter.process(content_str, file_name, file_type)

        else:
            raise ValueError(f"No processor found for file type: {file_type}")

    except Exception as e:
        logger.error(f"Failed to process {file_name}: {e}", exc_info=True)
        raise Exception(f"Failed to process {file_name}")

def _decode_content(content: bytes) -> str:
    try:
        return content.decode('utf-8')
    except UnicodeDecodeError:
        return content.decode('latin-1')
