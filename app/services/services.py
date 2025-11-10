# app/services/llm_service.py
# small utility file — currently a minimal LLM service / placeholder

import asyncio
import time
from typing import AsyncGenerator

def sanitize_input(text: str) -> str:
    """Simple input sanitizer used by routers."""
    return text.strip()

# --- synchronous placeholder (for simple use) ---
def query_llm_sync(prompt: str, mode: str = "tutor") -> dict:
    """
    Minimal sync implementation returning a stubbed response.
    Replace with real model call (e.g., genai.GenerativeModel.generate_content).
    """
    start = time.time()
    # --- simulate some processing ---
    text = f"[SIMULATED {mode.upper()} RESPONSE] {prompt}"
    elapsed = time.time() - start
    return {"text": text, "elapsed": elapsed}

# --- async wrapper used by routers (keeps router signatures async) ---
async def query_llm(prompt: str, mode: str = "tutor") -> dict:
    """
    Async wrapper that calls the sync implementation in a thread.
    Replace body with real async model calls / asyncio.to_thread(...) if needed.
    """
    # sanity
    if not isinstance(prompt, str):
        return {"error": "Invalid prompt type"}
    # call sync work in a background thread to keep event loop free
    result = await asyncio.to_thread(query_llm_sync, prompt, mode)
    # normalize the return to what routers expect
    if mode == "debugger":
        return {"explanation": result["text"], "steps_to_fix": [], "resources": []}
    else:
        return {"answer": result["text"]}

# --- optional streaming stub (async generator) ---
async def stream_llm(prompt: str) -> AsyncGenerator[str, None]:
    """
    Async generator stub that yields chunks (suitable for StreamingResponse).
    Replace with actual model streaming logic when ready.
    """
    text = f"[STREAM START] {prompt}"
    # simulate tokenized chunks
    for i in range(1, 4):
        await asyncio.sleep(0.1)
        yield f"{text} (chunk {i})"
    yield "[STREAM END]"


