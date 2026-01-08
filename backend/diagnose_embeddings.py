import os
import google.generativeai as genai
from dotenv import load_dotenv

def test_models():
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY not found")
        return

    genai.configure(api_key=api_key)
    
    models = [
        "models/embedding-001",
        "embedding-001",
        "models/text-embedding-004",
        "text-embedding-004",
        "models/text-embedding-004"
    ]
    
    for model_name in models:
        print(f"\n--- Testing {model_name} ---")
        try:
            res = genai.embed_content(model=model_name, content="hi")
            print(f"Simple call: SUCCESS")
        except Exception as e:
            print(f"Simple call: FAIL - {e}")

        try:
            res = genai.embed_content(model=model_name, content="hi", task_type="retrieval_query")
            print(f"With task_type: SUCCESS")
        except Exception as e:
            print(f"With task_type: FAIL - {e}")

if __name__ == "__main__":
    test_models()
