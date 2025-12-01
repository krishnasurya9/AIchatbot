import logging
import sys
import os
from backend.app.config import settings

# Ensure the log directory exists
log_file_path = settings.log_file
log_dir = os.path.dirname(log_file_path)
if log_dir and not os.path.exists(log_dir):
    os.makedirs(log_dir, exist_ok=True)

# Remove any existing handlers to prevent duplicate logs
for handler in logging.root.handlers[:]:
    logging.root.removeHandler(handler)

# Configure safe logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(module)s:%(lineno)d] - %(message)s',
    handlers=[
        logging.FileHandler(log_file_path, encoding='utf-8', errors='replace'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("backend")
