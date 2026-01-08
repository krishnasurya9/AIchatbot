
import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

if not api_key:
    print("No API Key")
    exit(1)

print(f"Testing with key beginning: {api_key[:5]}...")

models_to_test = ["models/gemini-1.5-flash"]

for m in models_to_test:
    print(f"\nTesting model: {m}")
    try:
        llm = ChatGoogleGenerativeAI(model=m, google_api_key=api_key)
        res = llm.invoke("Hello, are you there?")
        print(f"SUCCESS: {res.content}")
    except Exception as e:
        print(f"FAILED: {e}")
