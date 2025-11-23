# Quick Start Guide - Testing Day 4 Features

## ✅ Extension Compiled Successfully!

Your extension is ready to test. Follow these steps:

## Step 1: Start Backend (if not running)

Open a new terminal:
```powershell
cd "C:\Users\91789\Downloads\AIchatbot-RAG (1)\AIchatbot-RAG\backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Step 2: Start Frontend (if not running)

Open another terminal:
```powershell
cd "C:\Users\91789\Downloads\AIchatbot-RAG (1)\AIchatbot-RAG\frontend"
python -m http.server 3000
```

## Step 3: Install Extension in VS Code

### Option A: Development Mode (Easiest)
1. Open VS Code
2. Open folder: `AIchatbot-RAG/extension`
3. Press **F5** (starts Extension Development Host)
4. New VS Code window opens with extension loaded

### Option B: Package Extension
```powershell
cd "C:\Users\91789\Downloads\AIchatbot-RAG (1)\AIchatbot-RAG\extension"
npm install -g @vscode/vsce
vsce package
```

Then in VS Code:
- Press `Ctrl+Shift+P`
- Type: "Extensions: Install from VSIX..."
- Select `ai-debugger-0.0.1.vsix`

## Step 4: Test Frontend (http://localhost:3000)

1. **Mode Selector**: 
   - Try "Fast Mode" → quick responses
   - Try "Deep Tutor" → detailed responses

2. **Clear Session**: 
   - Send messages, click "Clear" button
   - Verify messages disappear

3. **Timestamps**: 
   - Check timestamps on messages

4. **Typing Indicator**: 
   - Watch for "AI is typing..." when sending

## Step 5: Test Extension

1. **Open Extension**:
   - Click beaker icon (🔬) in VS Code sidebar
   - See "AI Debugger" panel

2. **Test Modes**:
   - Select "Tutor Mode" → structured response
   - Select "Debugger Mode" → conversational response

3. **Debug Panel**:
   - Click "📊 Show Debug Logs"
   - Send requests
   - See request history with timings

4. **Error Detection**:
   - Create a file with syntax error
   - Extension auto-detects and shows error

## Quick Verification

✅ Extension compiled: `out/extension.js` exists
✅ Backend running: Visit http://localhost:8000
✅ Frontend running: Visit http://localhost:3000
✅ Extension ready: Can install in VS Code

## Need Help?

Check `TESTING_GUIDE.md` for detailed testing steps.

