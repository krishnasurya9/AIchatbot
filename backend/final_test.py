import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv('GEMINI_API_KEY')
genai.configure(api_key=api_key)

models = ['models/text-embedding-004', 'models/embedding-001']

print("--- Testing Embeddings ---")
for m in models:
    # Test 1: Simple
    try:
        genai.embed_content(model=m, content="test")
        print(f"{m} (no task_type): SUCCESS")
    except Exception as e:
        print(f"{m} (no task_type): FAIL - {str(e)[:100]}")
    
    # Test 2: With task_type
    try:
        genai.embed_content(model=m, content="test", task_type="retrieval_query")
        print(f"{m} (retrieval_query): SUCCESS")
    except Exception as e:
        print(f"{m} (retrieval_query): FAIL - {str(e)[:100]}")
