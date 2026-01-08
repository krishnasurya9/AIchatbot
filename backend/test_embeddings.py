import asyncio
import os
from dotenv import load_dotenv
import google.generativeai as genai

async def test_models():
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY not found")
        return

    genai.configure(api_key=api_key)
    
    models = ["models/embedding-001", "models/text-embedding-004", "embedding-001", "text-embedding-004"]
    
    for model_name in models:
        print(f"\n--- Testing model: {model_name} ---")
        try:
            # Try without task_type
            print("Trying WITHOUT task_type...")
            res = genai.embed_content(model=model_name, content="Hello")
            print(f"SUCCESS (no task_type)")
            continue
        except Exception as e:
            print(f"FAILED (no task_type): {str(e)[:100]}")

        try:
            # Try with task_type
            print("Trying WITH task_type='retrieval_query'...")
            res = genai.embed_content(model=model_name, content="Hello", task_type="retrieval_query")
            print(f"SUCCESS (with task_type)")
            continue
        except Exception as e:
            print(f"FAILED (with task_type): {str(e)[:100]}")

if __name__ == "__main__":
    asyncio.run(test_models())
