import google.generativeai as genai
from backend.app.config import settings

genai.configure(api_key=settings.google_api_key)

# Try the model name from settings
model = genai.GenerativeModel(settings.DEFAULT_MODEL)
response = model.generate_content("Hello from Gemini test setup!")
print("✅ Gemini connected successfully!")
print("Response:", response.text)

# text = ""

# while text != 0:
#     text = input("Enter your message (or type '0' to exit): ")
#     if text == '0':
#         break
#     response = model.generate_content(text)
#     print("Response:", response.text)
