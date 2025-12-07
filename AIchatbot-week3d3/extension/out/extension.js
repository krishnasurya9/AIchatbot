"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const BACKEND_URL = 'http://localhost:8000';
function activate(context) {
    console.log('AI Dev Companion extension is now active');
    // Initialize or retrieve persistent session ID
    let sessionId = context.globalState.get('sessionId');
    if (!sessionId) {
        sessionId = (0, uuid_1.v4)();
        context.globalState.update('sessionId', sessionId);
        console.log(`Created new session ID: ${sessionId}`);
    }
    else {
        console.log(`Using existing session ID: ${sessionId}`);
    }
    // Create webview provider
    const provider = new AIDebuggerViewProvider(context.extensionUri, sessionId, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('ai-debugger-view', provider));
    // Register "Ask Question" command
    const askQuestionCommand = vscode.commands.registerCommand('ai-debugger.askQuestion', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }
        // Capture selected text or current line
        let selectedText = editor.document.getText(editor.selection);
        if (!selectedText) {
            // If no selection, get current line
            const currentLine = editor.selection.active.line;
            selectedText = editor.document.lineAt(currentLine).text;
        }
        if (!selectedText.trim()) {
            vscode.window.showWarningMessage('No text selected or current line is empty');
            return;
        }
        // Get additional context
        const fileName = editor.document.fileName;
        const languageId = editor.document.languageId;
        const lineNumber = editor.selection.active.line + 1;
        // Prompt user for their question
        const question = await vscode.window.showInputBox({
            prompt: 'Ask AI Tutor about the selected code',
            placeHolder: 'e.g., What does this code do? or How can I optimize this?',
            value: 'Explain this code:'
        });
        if (!question) {
            return;
        }
        // Build context-aware query
        const contextualQuery = `File: ${fileName} (${languageId}), Line ${lineNumber}\n\nCode:\n${selectedText}\n\nQuestion: ${question}`;
        // Send to AI Tutor through the webview provider
        await provider.sendMessage(contextualQuery, 'tutor');
        // Show the webview panel
        vscode.commands.executeCommand('ai-debugger-view.focus');
    });
    // Register open panel command
    const openPanelCommand = vscode.commands.registerCommand('ai-debugger.openPanel', () => {
        vscode.commands.executeCommand('ai-debugger-view.focus');
    });
    // Monitor diagnostics for automatic error detection
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('ai-debugger');
    vscode.languages.onDidChangeDiagnostics(async (e) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const uri = editor.document.uri;
        const diagnostics = vscode.languages.getDiagnostics(uri);
        if (diagnostics.length > 0) {
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
            if (errors.length > 0 && provider.isAutoDebugEnabled()) {
                const firstError = errors[0];
                const errorLine = editor.document.lineAt(firstError.range.start.line);
                const errorContext = `
File: ${uri.fsPath}
Line ${firstError.range.start.line + 1}: ${firstError.message}

Code:
${errorLine.text}

Please help debug this error.`;
                await provider.sendMessage(errorContext, 'debugger', true);
            }
        }
    });
    context.subscriptions.push(askQuestionCommand, openPanelCommand, diagnosticCollection);
}
class AIDebuggerViewProvider {
    constructor(_extensionUri, sessionId, context) {
        this._extensionUri = _extensionUri;
        this._messageHistory = [];
        this._autoDebugEnabled = false;
        this._llmMode = 'fast';
        this._requestLogs = [];
        this._sessionId = sessionId;
        this._context = context;
        this.loadConversationHistory();
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.sendMessage(data.message, data.mode);
                    break;
                case 'toggleAutoDebug':
                    this._autoDebugEnabled = data.enabled;
                    break;
                case 'setLLMMode':
                    if (data.mode === 'fast' || data.mode === 'deep') {
                        this._llmMode = data.mode;
                    }
                    break;
                case 'clearHistory':
                    await this.clearHistory();
                    break;
                case 'getHistory':
                    await this.loadConversationHistory();
                    this._view?.webview.postMessage({
                        type: 'historyLoaded',
                        messages: this._messageHistory
                    });
                    break;
                case 'attachFile': {
                    const files = await vscode.window.showOpenDialog({ canSelectMany: false });
                    if (files && files.length > 0) {
                        const uri = files[0];
                        const contentBin = await vscode.workspace.fs.readFile(uri);
                        const content = Buffer.from(contentBin).toString('utf8');
                        const text = `Debug this file: ${uri.fsPath}\n\nContent:\n${content}`;
                        this._view?.webview.postMessage({ type: 'prefill', text });
                    }
                    break;
                }
                case 'useSelection': {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        const sel = editor.document.getText(editor.selection) || editor.document.lineAt(editor.selection.active.line).text;
                        const text = `Analyze this selection:\n\n${sel}`;
                        this._view?.webview.postMessage({ type: 'prefill', text });
                    }
                    break;
                }
                case 'pasteCode': {
                    const text = await vscode.env.clipboard.readText();
                    const msg = text ? `Analyze this code:\n\n${text}` : '';
                    this._view?.webview.postMessage({ type: 'prefill', text: msg });
                    break;
                }
                case 'runDebugger': {
                    const msg = typeof data.message === 'string' ? data.message : '';
                    if (msg.trim()) {
                        await this.sendMessage(msg, 'debugger');
                    }
                    break;
                }
            }
        });
        // Load existing conversation history on startup
        this.loadConversationHistory();
    }
    isAutoDebugEnabled() {
        return this._autoDebugEnabled;
    }
    async sendMessage(message, mode = 'debugger', isAutomatic = false) {
        if (!this._view) {
            return;
        }
        // Add user message to history
        const userMessage = {
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        };
        this._messageHistory.push(userMessage);
        // Update UI with user message
        this._view.webview.postMessage({
            type: 'userMessage',
            message: message
        });
        try {
            this._view.webview.postMessage({ type: 'typing', show: true });
            // Determine endpoint based on mode
            const endpoint = mode === 'tutor' ? '/api/tutor/chat' : '/api/debugger/chat';
            const start = Date.now();
            // Call backend API
            const response = await axios_1.default.post(`${BACKEND_URL}${endpoint}`, {
                session_id: this._sessionId,
                query: message,
                mode: this._llmMode
            });
            const aiResponse = response.data;
            // Add AI response to history
            const assistantMessage = {
                role: 'assistant',
                content: aiResponse.response || JSON.stringify(aiResponse),
                timestamp: new Date().toISOString()
            };
            this._messageHistory.push(assistantMessage);
            // Update UI with AI response
            this._view.webview.postMessage({
                type: 'aiResponse',
                response: aiResponse,
                mode: mode
            });
            this._view.webview.postMessage({ type: 'typing', show: false });
            const durationMs = Date.now() - start;
            this._requestLogs.push({ endpoint, mode, startedAt: start, durationMs, status: 'ok' });
            this._view.webview.postMessage({ type: 'logUpdate', logs: this._requestLogs.slice(-20) });
            // Sync messages to backend for shared history
            await this.syncMessagesToBackend(userMessage, assistantMessage);
        }
        catch (error) {
            console.error('Error communicating with backend:', error);
            const errorMessage = axios_1.default.isAxiosError(error)
                ? `Backend error: ${error.response?.data?.detail || error.message}`
                : 'Failed to connect to AI service';
            this._view.webview.postMessage({
                type: 'error',
                message: errorMessage
            });
            this._view.webview.postMessage({ type: 'typing', show: false });
            const endpoint = mode === 'tutor' ? '/api/tutor/chat' : '/api/debugger/chat';
            this._requestLogs.push({ endpoint, mode, startedAt: Date.now(), durationMs: 0, status: 'error', error: errorMessage });
            this._view.webview.postMessage({ type: 'logUpdate', logs: this._requestLogs.slice(-20) });
            vscode.window.showErrorMessage(errorMessage);
        }
    }
    async syncMessagesToBackend(userMessage, assistantMessage) {
        try {
            // Sync user message
            await axios_1.default.post(`${BACKEND_URL}/api/sessions/${this._sessionId}/messages`, {
                role: userMessage.role,
                content: userMessage.content,
                timestamp: userMessage.timestamp
            });
            // Sync assistant message
            await axios_1.default.post(`${BACKEND_URL}/api/sessions/${this._sessionId}/messages`, {
                role: assistantMessage.role,
                content: assistantMessage.content,
                timestamp: assistantMessage.timestamp
            });
            console.log('Messages synced to backend successfully');
        }
        catch (error) {
            console.error('Failed to sync messages to backend:', error);
        }
    }
    async loadConversationHistory() {
        try {
            const response = await axios_1.default.get(`${BACKEND_URL}/api/sessions/${this._sessionId}/messages`);
            this._messageHistory = response.data.messages || [];
            console.log(`Loaded ${this._messageHistory.length} messages from backend`);
        }
        catch (error) {
            console.error('Failed to load conversation history:', error);
            this._messageHistory = [];
        }
    }
    async clearHistory() {
        try {
            await axios_1.default.delete(`${BACKEND_URL}/api/sessions/${this._sessionId}/messages`);
            this._messageHistory = [];
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'historyCleared'
                });
            }
            vscode.window.showInformationMessage('Conversation history cleared');
        }
        catch (error) {
            console.error('Failed to clear history:', error);
            vscode.window.showErrorMessage('Failed to clear conversation history');
        }
    }
    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Dev Companion</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .wrapper { max-width: 800px; margin: 0 auto; width: 100%; }
        
        .header {
            padding: 12px;
            background-color: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .header h3 {
            font-size: 14px;
            font-weight: 600;
        }
        
        .controls {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        
        .toggle-container {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
        }
        
        .toggle {
            position: relative;
            width: 36px;
            height: 18px;
        }
        
        .toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--vscode-input-background);
            transition: .3s;
            border-radius: 18px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 12px;
            width: 12px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .3s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: var(--vscode-button-background);
        }
        
        input:checked + .slider:before {
            transform: translateX(18px);
        }
        
        button {
            padding: 4px 10px;
            font-size: 11px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .mode-selector {
            padding: 12px;
            background-color: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 12px;
        }
        
        .mode-btn {
            flex: 1;
            padding: 12px;
            font-size: 13px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            cursor: pointer;
            transition: transform .15s ease, background-color .15s ease, border-color .15s ease;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .mode-btn.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
            transform: translateY(-1px);
            box-shadow: 0 2px 6px rgba(0,0,0,.2);
        }

        .prompt-card {
            margin: 12px;
            padding: 12px;
            background-color: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 12px;
            align-items: center;
        }
        .prompt-toolbar { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
        .icon-btn { border:1px solid var(--vscode-input-border); background:var(--vscode-input-background); color:var(--vscode-input-foreground); border-radius:6px; padding:6px 8px; font-size:12px; cursor:pointer; transition:transform .1s ease, background-color .15s ease; }
        .icon-btn:hover { transform: translateY(-1px); background: var(--vscode-editor-background); }
        .run-btn { padding:10px 16px; border-radius:8px; font-size:13px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border:none; cursor:pointer; transition: transform .1s ease, background-color .15s ease; }
        .run-btn:hover { transform: translateY(-1px); background: var(--vscode-button-hoverBackground); }

        .tabs { display:flex; gap:16px; align-items:center; font-size:12px; margin-bottom:8px; }
        .tab { cursor:pointer; color: var(--vscode-descriptionForeground); padding-bottom:6px; border-bottom:2px solid transparent; }
        .tab.active { color: var(--vscode-textLink-foreground); border-bottom-color: var(--vscode-textLink-foreground); }
        .chips { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
        .chip { padding:8px 10px; border:1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius:999px; font-size:12px; cursor:pointer; transition: background-color .15s ease; }
        .chip:hover { background: var(--vscode-editor-background); }
        
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .message {
            padding: 10px 12px;
            border-radius: 6px;
            max-width: 90%;
            word-wrap: break-word;
        }
        
        .message.user {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            align-self: flex-end;
            margin-left: auto;
        }
        
        .message.assistant {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            align-self: flex-start;
        }
        
        .message-content {
            font-size: 13px;
            line-height: 1.5;
        }
        
        .tutor-response {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .tutor-section {
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
        }
        
        .tutor-section h4 {
            font-size: 12px;
            margin-bottom: 6px;
            color: var(--vscode-textLink-foreground);
        }
        
        .tutor-section ul, .tutor-section ol {
            margin-left: 20px;
            font-size: 12px;
        }
        
        .tutor-section li {
            margin-bottom: 4px;
        }
        
        pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 12px;
        }
        
        code {
            font-family: var(--vscode-editor-font-family);
        }
        
        .input-container {
            padding: 12px;
            background-color: var(--vscode-sideBar-background);
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }
        
        #messageInput {
            flex: 1;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            resize: none;
            min-height: 36px;
            max-height: 120px;
        }
        
        #messageInput:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        #sendBtn {
            padding: 8px 16px;
            font-size: 13px;
            white-space: nowrap;
        }
        
        .loading {
            display: none;
            padding: 10px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        
        .loading.show {
            display: block;
        }
        
        .error-message {
            padding: 10px;
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            color: var(--vscode-errorForeground);
            font-size: 12px;
        }
        
        .empty-state {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
        }
        
        .empty-state h3 {
            font-size: 16px;
            margin-bottom: 8px;
        }
        
        .empty-state p {
            font-size: 12px;
            line-height: 1.6;
        }
        
        ::-webkit-scrollbar {
            width: 10px;
        }
        
        ::-webkit-scrollbar-track {
            background: var(--vscode-editor-background);
        }
        
        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 5px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }
        .debug-panel { margin: 10px; padding: 10px; background-color: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
        .debug-header { font-size: 12px; font-weight: 600; margin-bottom: 8px; color: var(--vscode-textLink-foreground); }
        .debug-list { display: flex; flex-direction: column; gap: 6px; }
        .debug-item { display: flex; justify-content: space-between; align-items: center; padding: 6px; background-color: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; font-size: 12px; }
        .debug-item .left { display: flex; gap: 8px; align-items: center; }
        .debug-item .badge { padding: 2px 6px; border-radius: 3px; }
        .badge.ok { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        .badge.error { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-errorForeground); }
    </style>
</head>
<body>
    <div class="wrapper">
    <div class="header">
        <h3>🤖 AI Debugger Assistant</h3>
        <div class="controls">
            <div class="toggle-container">
                <label for="autoDebug">Auto-Debug</label>
                <label class="toggle">
                    <input type="checkbox" id="autoDebug">
                    <span class="slider"></span>
                </label>
            </div>
            <button id="clearBtn" title="Clear conversation history">Clear</button>
            <button id="debugBtn" title="Toggle debug panel">Debug</button>
            <select id="llmMode" title="LLM Mode" style="background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px;padding:4px 6px;font-size:11px;">
                <option value="fast" selected>⚡ Fast</option>
                <option value="deep">🧠 Deep</option>
            </select>
        </div>
    </div>
    
    <div class="mode-selector">
        <button class="mode-btn active" data-mode="debugger">🐛 Debugger Mode<span style="opacity:.8;font-size:11px;"> Run diagnostics on your code</span></button>
        <button class="mode-btn" data-mode="tutor">🎓 Tutor Mode<span style="opacity:.8;font-size:11px;"> Step-by-step learning help</span></button>
    </div>
    
    <div class="chat-container" id="chatContainer">
        <div class="empty-state">
            <h3>Get help with coding errors and questions</h3>
            <p>Select code and press <strong>Ctrl+Shift+A</strong> (Cmd+Shift+A on Mac)</p>
        </div>
    </div>
    
    <div class="loading" id="loading">AI is typing…</div>
    
    <div class="prompt-card">
        <div>
            <div class="prompt-toolbar">
                <button class="icon-btn" id="attachBtn">📎 Attach File</button>
                <button class="icon-btn" id="selectionBtn">🔍 Use Selection</button>
                <button class="icon-btn" id="pasteBtn">📋 Paste Code</button>
            </div>
            <textarea id="messageInput" placeholder="Why is this error happening? Attach file or paste code..." rows="2"></textarea>
        </div>
        <div>
            <button class="run-btn" id="runDebuggerBtn">Run Debugger ▶</button>
        </div>
    </div>

    <div id="debugPanel" class="debug-panel">
        <div class="debug-header">Request Logs</div>
        <div id="debugList" class="debug-list"></div>
    </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const loading = document.getElementById('loading');
        const autoDebugToggle = document.getElementById('autoDebug');
        const clearBtn = document.getElementById('clearBtn');
        const modeButtons = document.querySelectorAll('.mode-btn');
        const debugBtn = document.getElementById('debugBtn');
        const debugPanel = document.getElementById('debugPanel');
        const llmModeSelect = document.getElementById('llmMode');
        const attachBtn = document.getElementById('attachBtn');
        const pasteBtn = document.getElementById('pasteBtn');
        const selectionBtn = document.getElementById('selectionBtn');
        const runDebuggerBtn = document.getElementById('runDebuggerBtn');
        let logs: any[] = [];
        let currentTab = 'errors';
        
        let currentMode = 'debugger';
        
        // Mode switching
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentMode = btn.dataset.mode;
            });
        });
        
        // Auto-debug toggle
        autoDebugToggle.addEventListener('change', () => {
            vscode.postMessage({
                type: 'toggleAutoDebug',
                enabled: autoDebugToggle.checked
            });
        });
        
        // Clear history
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear all conversation history?')) {
                vscode.postMessage({ type: 'clearHistory' });
            }
        });

        debugBtn.addEventListener('click', () => {
            debugPanel.classList.toggle('hidden');
            if (!debugPanel.classList.contains('hidden')) {
                renderLogs(logs);
            }
        });

        document.querySelectorAll('.tab').forEach(t => {
            t.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
                t.classList.add('active');
                currentTab = t.getAttribute('data-tab');
                renderLogs(logs);
            });
        });

        document.querySelectorAll('.chip').forEach(c => {
            c.addEventListener('click', () => {
                const text = c.getAttribute('data-template') || '';
                if (text) {
                    messageInput.value = text;
                    messageInput.style.height = 'auto';
                    messageInput.style.height = messageInput.scrollHeight + 'px';
                }
            });
        });

        attachBtn.addEventListener('click', () => { vscode.postMessage({ type: 'attachFile' }); });
        pasteBtn.addEventListener('click', () => { vscode.postMessage({ type: 'pasteCode' }); });
        selectionBtn.addEventListener('click', () => { vscode.postMessage({ type: 'useSelection' }); });
        runDebuggerBtn.addEventListener('click', () => {
            const message = messageInput.value.trim();
            if (!message) return;
            vscode.postMessage({ type: 'runDebugger', message });
        });
        
        // Send message
        function sendMessage() {
            const message = messageInput.value.trim();
            if (!message) return;
            
            vscode.postMessage({
                type: 'sendMessage',
                message: message,
                mode: currentMode
            });
            
            messageInput.value = '';
            messageInput.style.height = 'auto';
        }
        
        if (sendBtn) { sendBtn.addEventListener('click', sendMessage); }
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        llmModeSelect.addEventListener('change', () => {
            const m = (llmModeSelect as HTMLSelectElement).value;
            vscode.postMessage({ type: 'setLLMMode', mode: m });
        });
        
        // Auto-resize textarea
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = messageInput.scrollHeight + 'px';
        });
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'userMessage':
                    removeEmptyState();
                    addMessage(message.message, 'user');
                    showLoading();
                    break;
                    
                case 'aiResponse':
                    hideLoading();
                    addAIResponse(message.response, message.mode);
                    break;
                    
                case 'error':
                    hideLoading();
                    addError(message.message);
                    break;
                    
                case 'historyLoaded':
                    loadHistory(message.messages);
                    break;
                    
                case 'historyCleared':
                    clearChat();
                    break;
                case 'logUpdate':
                    logs = message.logs || [];
                    if (!debugPanel.classList.contains('hidden')) {
                        renderLogs(logs);
                    }
                    break;
                case 'prefill':
                    if (message.text) {
                        messageInput.value = message.text;
                        messageInput.style.height = 'auto';
                        messageInput.style.height = messageInput.scrollHeight + 'px';
                        removeEmptyState();
                    }
                    break;
            }
        });
        
        function removeEmptyState() {
            const emptyState = chatContainer.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }
        }
        
        function addMessage(content, role) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${role}\`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            const ts = new Date().toLocaleTimeString();
            contentDiv.innerHTML = \`<div>\${escapeHtml(content)}</div><div class=\"text-xs\" style=\"opacity:.7;margin-top:4px;\">\${ts}</div>\`;
            
            messageDiv.appendChild(contentDiv);
            chatContainer.appendChild(messageDiv);
            scrollToBottom();
        }
        
        function addAIResponse(response, mode) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message assistant';
            
            if (mode === 'tutor' && typeof response === 'object') {
                // Structured tutor response
                const tutorDiv = document.createElement('div');
                tutorDiv.className = 'tutor-response';
                
                if (response.explanation) {
                    const section = document.createElement('div');
                    section.className = 'tutor-section';
                    section.innerHTML = \`<h4>📖 Explanation</h4><p>\${response.explanation}</p>\`;
                    tutorDiv.appendChild(section);
                }
                
                if (response.steps && response.steps.length > 0) {
                    const section = document.createElement('div');
                    section.className = 'tutor-section';
                    section.innerHTML = \`<h4>📋 Steps</h4><ol>\${response.steps.map(s => \`<li>\${s}</li>\`).join('')}</ol>\`;
                    tutorDiv.appendChild(section);
                }
                
                if (response.code_fix) {
                    const section = document.createElement('div');
                    section.className = 'tutor-section';
                    section.innerHTML = \`<h4>💻 Code Fix</h4><pre><code>\${escapeHtml(response.code_fix)}</code></pre>\`;
                    tutorDiv.appendChild(section);
                }
                
                if (response.resources && response.resources.length > 0) {
                    const section = document.createElement('div');
                    section.className = 'tutor-section';
                    section.innerHTML = \`<h4>🔗 Resources</h4><ul>\${response.resources.map(r => \`<li>\${r}</li>\`).join('')}</ul>\`;
                    tutorDiv.appendChild(section);
                }
                
                messageDiv.appendChild(tutorDiv);
            } else {
                // Simple text response
                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                const text = typeof response === 'string' ? response : response.response || JSON.stringify(response);
                const ts = new Date().toLocaleTimeString();
                contentDiv.innerHTML = \`<div>\${escapeHtml(text)}</div><div class=\"text-xs\" style=\"opacity:.7;margin-top:4px;\">\${ts}</div>\`;
                messageDiv.appendChild(contentDiv);
            }
            
            chatContainer.appendChild(messageDiv);
            scrollToBottom();
        }
        
        function addError(message) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = '⚠️ ' + message;
            chatContainer.appendChild(errorDiv);
            scrollToBottom();
        }

        function renderLogs(items) {
            const list = document.getElementById('debugList');
            const arr = (items || []).slice().reverse().filter(it => {
                if (currentTab === 'errors') return it.status === 'error';
                if (currentTab === 'warnings') return false;
                if (currentTab === 'info') return it.status === 'ok';
                return true;
            });
            if (arr.length === 0) {
                list.innerHTML = '<div style="opacity:.7;font-size:12px;">No requests yet</div>';
                return;
            }
            const rows = [] as string[];
            for (const it of arr) {
                const t = new Date(it.startedAt).toLocaleTimeString();
                const badgeClass = it.status === 'ok' ? 'badge ok' : 'badge error';
                const right = String(it.durationMs) + ' ms';
                const left = '⏱ ' + t + ' • ' + it.mode + ' • ' + it.endpoint;
                const err = it.error ? ' — ' + escapeHtml(String(it.error)) : '';
                rows.push('<div class="debug-item"><div class="left"><span class="' + badgeClass + '">' + it.status + '</span><span>' + left + err + '</span></div><div>' + right + '</div></div>');
            }
            list.innerHTML = rows.join('');
        }
        
        function showLoading() {
            loading.classList.add('show');
        }
        
        function hideLoading() {
            loading.classList.remove('show');
        }
        
        function loadHistory(messages) {
            removeEmptyState();
            clearChat();
            messages.forEach(msg => {
                if (msg.role === 'user') {
                    addMessage(msg.content, 'user');
                } else {
                    addAIResponse({ response: msg.content }, 'debugger');
                }
            });
        }
        
        function clearChat() {
            chatContainer.innerHTML = '<div class="empty-state"><h3>👋 Welcome to AI Dev Companion</h3><p>Ask questions, debug code, or learn new concepts.<br>Select code and press <strong>Ctrl+Shift+A</strong> (Cmd+Shift+A on Mac) for quick help.</p></div>';
        }
        
        function scrollToBottom() {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Load conversation history on startup
        vscode.postMessage({ type: 'getHistory' });
    </script>
</body>
</html>`;
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map