
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

print(f"API Key present: {bool(api_key)}")

if api_key:
    genai.configure(api_key=api_key)
    try:
        print("Listing available models:")
        with open("available_models_utf8.txt", "w", encoding="utf-8") as f:
             for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods and 'gemini' in m.name.lower():
                    print(f"- {m.name}")
                    f.write(f"{m.name}\n")
    except Exception as e:
        print(f"Error listing models: {e}")
else:
    print("No API Key found")
