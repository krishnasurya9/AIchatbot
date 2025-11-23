# Testing Guide - Day 4 UI/UX Enhancements

## Prerequisites

1. **Backend Server** - Should be running on `http://localhost:8000`
2. **Frontend Server** - Should be running on `http://localhost:3000`
3. **VS Code Extension** - Compiled and ready to install

## Starting the Servers

### Backend
```powershell
cd "C:\Users\91789\Downloads\AIchatbot-RAG (1)\AIchatbot-RAG\backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend
```powershell
cd "C:\Users\91789\Downloads\AIchatbot-RAG (1)\AIchatbot-RAG\frontend"
python -m http.server 3000
```

## Testing Frontend Features

### 1. Mode Selector
- **Location**: Top right of chat header
- **Test Steps**:
  1. Open `http://localhost:3000`
  2. Select "Fast Mode" from dropdown
  3. Send a message: "What is Python?"
  4. Note: Response should be concise
  5. Switch to "Deep Tutor" mode
  6. Send same message
  7. Note: Response should be more comprehensive

### 2. Clear Session Button
- **Location**: Next to mode selector (red "Clear" button)
- **Test Steps**:
  1. Send a few messages to build conversation history
  2. Click "Clear" button
  3. Confirm the dialog
  4. Verify: All messages cleared, new session created
  5. Check console: Should see "Session cleared" message

### 3. Timestamps
- **Test Steps**:
  1. Send a message
  2. Verify: Timestamp appears next to sender name
  3. Recent messages show "just now" or "Xm ago"
  4. Older messages show full date/time

### 4. Role-Based Colors
- **Test Steps**:
  1. Send a user message
  2. Verify: Blue background, right-aligned, white text
  3. Receive AI response
  4. Verify: Gray background, left-aligned, dark text
  5. System messages (after clear): Centered, italic, gray

### 5. Typing Indicator
- **Test Steps**:
  1. Send a message
  2. Immediately check: "AI is typing..." appears with animated dots
  3. Wait for response
  4. Verify: Typing indicator disappears when response arrives

### 6. Session Management
- **Test Steps**:
  1. Open browser console (F12)
  2. Check: Should see "Session initialized" message
  3. Send messages
  4. Verify: Same session ID used for all requests

## Testing VS Code Extension

### Installing the Extension

#### Option 1: Package as .vsix (Recommended)
```powershell
cd "C:\Users\91789\Downloads\AIchatbot-RAG (1)\AIchatbot-RAG\extension"
npm install -g vsce
vsce package
```
This creates `ai-debugger-0.0.1.vsix`

Then in VS Code:
1. Open Command Palette (Ctrl+Shift+P)
2. Type: "Extensions: Install from VSIX..."
3. Select the generated `.vsix` file

#### Option 2: Development Mode
1. Open VS Code
2. Open the extension folder: `AIchatbot-RAG/extension`
3. Press F5 to launch Extension Development Host
4. New VS Code window opens with extension loaded

### Testing Extension Features

#### 1. Open Extension View
- Click the beaker icon in the Activity Bar (left sidebar)
- Should see "AI Debugger" panel

#### 2. Mode Selection
- **Test Steps**:
  1. Select "Tutor Mode" radio button
  2. Type: "How do I fix a syntax error?"
  3. Click "Ask AI Tutor"
  4. Verify: Structured response with explanation, steps, resources
  5. Switch to "Debugger Mode"
  6. Ask same question
  7. Verify: Conversational response format

#### 3. Error Detection
- **Test Steps**:
  1. Create a Python file with a syntax error
  2. Save the file
  3. Check extension panel
  4. Verify: Error appears in "Detected Problems" section

#### 4. Debug Log Panel
- **Test Steps**:
  1. Click "📊 Show Debug Logs" link
  2. Panel expands showing request history
  3. Send a request
  4. Verify: New log entry appears with:
     - Timestamp
     - Endpoint name
     - Response time (ms)
     - Success/Error status
     - Mode used
  5. Test error case: Stop backend, send request
  6. Verify: Error logged in red with error message

#### 5. Request Tracking
- **Test Steps**:
  1. Send multiple requests
  2. Check debug panel
  3. Verify: Last 20 requests are shown (most recent first)
  4. Check response times are displayed
  5. Verify: Success (✓) and Error (✗) indicators

## Backend API Testing

### Test Mode Parameter
```powershell
# Fast Mode
$body = @{message="What is Python?"; mode="fast"; session_id="test-123"} | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:8000/chat" -Method POST -Body $body -ContentType "application/json"

# Deep Mode
$body = @{message="What is Python?"; mode="deep"; session_id="test-123"} | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:8000/chat" -Method POST -Body $body -ContentType "application/json"
```

### Test Clear Session
```powershell
# First create a session
$response = Invoke-WebRequest -Uri "http://localhost:8000/api/sessions/" -Method POST
$session = $response.Content | ConvertFrom-Json
$sessionId = $session.session_id

# Clear the session
Invoke-WebRequest -Uri "http://localhost:8000/api/sessions/$sessionId/clear" -Method POST
```

## Verification Checklist

### Frontend
- [ ] Mode selector changes response style
- [ ] Clear session button works and resets conversation
- [ ] Timestamps appear on all messages
- [ ] User messages are blue/right-aligned
- [ ] AI messages are gray/left-aligned
- [ ] Typing indicator appears during requests
- [ ] Session ID persists across page interactions

### Extension
- [ ] Extension loads in VS Code
- [ ] Tutor mode provides structured responses
- [ ] Debugger mode provides conversational responses
- [ ] Error detection works
- [ ] Debug panel shows request logs
- [ ] Response times are tracked
- [ ] Errors are logged correctly

### Backend
- [ ] `/chat` endpoint accepts mode parameter
- [ ] `/api/tutor/chat` accepts mode parameter
- [ ] `/api/debugger/chat` accepts mode parameter
- [ ] `/api/sessions/{id}/clear` clears session data
- [ ] Fast mode returns concise responses
- [ ] Deep mode returns comprehensive responses

## Troubleshooting

### Backend Not Starting
- Check if port 8000 is already in use
- Verify MongoDB is running (if using database features)
- Check `.env` file for API keys (optional)

### Frontend Not Loading
- Check if port 3000 is available
- Verify you're in the `frontend` directory
- Check browser console for errors

### Extension Not Working
- Recompile: `npm run compile`
- Check VS Code Developer Console (Help > Toggle Developer Tools)
- Verify backend is running on `http://127.0.0.1:8000`
- Check extension output panel

### Mode Not Working
- Verify backend received mode parameter (check logs)
- Check browser/extension console for errors
- Ensure backend endpoints are updated

## Quick Test Commands

```powershell
# Check if servers are running
Test-NetConnection -ComputerName localhost -Port 8000
Test-NetConnection -ComputerName localhost -Port 3000

# View backend logs
Get-Content "C:\Users\91789\Downloads\AIchatbot-RAG (1)\AIchatbot-RAG\backend\backend_app.log" -Tail 20
```


