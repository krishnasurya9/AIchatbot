import asyncio
import os
from dotenv import load_dotenv
import google.generativeai as genai

async def test_embedding():
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY not found")
        return

    print(f"Configuring with API key: {api_key[:10]}...")
    genai.configure(api_key=api_key)
    
    model_name = "embedding-001"
    print(f"Testing embedding with model: {model_name}")
    try:
        result = genai.embed_content(model=model_name, content="Hello world", task_type="retrieval_query")
        print("Embedding test PASSED")
    except Exception as e:
        print(f"Embedding test FAILED: {e}")
        import traceback
        traceback.print_exc()

async def test_generation():
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    genai.configure(api_key=api_key)
    
    model_name = "gemini-1.5-flash"
    print(f"Testing generation with model: {model_name}")
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content("Hello")
        print(f"Generation test PASSED: {response.text[:50]}...")
    except Exception as e:
        print(f"Generation test FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_embedding())
    print("-" * 20)
    asyncio.run(test_generation())
