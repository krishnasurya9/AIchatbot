import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from together import Together
from dotenv import load_dotenv
import traceback

# --- Load environment variables ---
load_dotenv()

# --- Initialize Together client ---
TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY")
if not TOGETHER_API_KEY:
    raise ValueError("❌ TOGETHER_API_KEY not found in .env file")

client = Together(api_key=TOGETHER_API_KEY)

# --- FastAPI app setup ---
app = FastAPI(title="AI Chat Backend", version="1.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Chat request model ---
class ChatRequest(BaseModel):
    message: str

# --- Chat endpoint ---
@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        print(f"💬 Received message: {req.message}")

        response = client.chat.completions.create(
            model="meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
            messages=[
                {"role": "system", "content": "You are an AI assistant that helps with development, debugging, and code understanding."},
                {"role": "user", "content": req.message},
            ],
        )

        # ✅ Handle both old and new SDK response formats
        if hasattr(response, "choices"):
            reply = response.choices[0].message.content
        elif hasattr(response, "output"):
            reply = response.output[0].content[0].text
        else:
            reply = "⚠️ Unexpected API response format."

        print(f"🤖 Reply: {reply}")
        return {"reply": reply}

    except Exception as e:
        print("❌ Error while connecting to Together API:\n", traceback.format_exc())
        return {"reply": "⚠️ Sorry, I couldn’t connect to the Together AI service right now."}


# --- Root route ---
@app.get("/")
async def root():
    return {"message": "✅ AI Chat Backend is running and connected to Together AI."}
