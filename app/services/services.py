# This file is for any common utility functions that might be shared
# across different services, such as text cleaning, data formatting, etc.

def sanitize_input(text: str) -> str:
    """A simple example of a shared utility function."""
    return text.strip()

