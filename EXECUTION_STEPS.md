# Run Guide

## Prerequisites
- Windows with PowerShell
- Python 3.11+ and `pip`
- Node.js 18+ and `npm`
- VS Code installed

## Backend (FastAPI)
- Open PowerShell in repository root
- Install Python dependencies:
  - `python -m pip install -r AIchatbot-week3d2/AIchatbot-RAG/requirements.txt`
- Set API keys (optional but recommended):
  - `setx GOOGLE_API_KEY "<your_key>"`
  - `setx TOGETHER_API_KEY "<your_key>"`
  - Restart the terminal after setting keys
- Start the server:
  - `cd AIchatbot-week3d2/AIchatbot-RAG/backend`
  - `uvicorn app.main:app --reload`
- Backend URL: `http://127.0.0.1:8000/`

## Frontend (Static HTML)
- Open a new PowerShell window
- Start a simple static server:
  - `cd AIchatbot-week3d2/AIchatbot-RAG/frontend`
  - `python -m http.server 5500`
- Frontend URL: `http://localhost:5500/`

## Extension (VS Code)
- Open a new PowerShell window
- Install and build:
  - `cd AIchatbot-week3d2/AIchatbot-RAG/extension`
  - `npm install`
  - `npm run compile`
- Launch the Extension Development Host:
  - Option A: `npm run dev`
  - Option B: open the folder in VS Code and press `F5` (Run and Debug → Launch Extension)

## Viewing the Panel
- In the Extension Development Host, open the Activity Bar item “AI Dev Companion”
- The webview shows:
  - Mode cards: Debugger Mode and Tutor Mode
  - Prompt card with Attach File, Use Selection, Paste Code, and Run Debugger
  - Debug Log panel with tabs (Errors, Warnings, Info, My Requests)
- Click “Debug” to toggle the log panel
- Send a message; watch “AI is typing…” and logs update with status, endpoint, mode, and response time

## Tips
- If the panel shows no responses, confirm backend is running on `http://127.0.0.1:8000/`
- The extension targets `http://localhost:8000`; ensure both resolve to the same server
- After setting env vars with `setx`, restart PowerShell to apply them