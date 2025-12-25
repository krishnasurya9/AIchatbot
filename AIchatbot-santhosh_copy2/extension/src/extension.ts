import * as vscode from 'vscode';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const BACKEND_URL = 'http://localhost:8000';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
}

interface ChatResponse {
    response: string;
    explanation?: string;
    steps?: string[];
    resources?: string[];
    code_fix?: string;
}

export function activate(context: vscode.ExtensionContext) {
    try {
        vscode.window.showInformationMessage('DEBUG: Step 1 - Start Activate');
        console.log('AI Dev Companion extension is now active (DEBUG)');

        // Initialize or retrieve persistent session ID
        let sessionId = context.globalState.get<string>('sessionId');
        if (!sessionId) {
            sessionId = uuidv4();
            context.globalState.update('sessionId', sessionId);
        }

        // Create webview provider
        const provider = new AIDebuggerViewProvider(context.extensionUri, sessionId, context);
        vscode.window.showInformationMessage('DEBUG: Step 2 - Provider Created');

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('ai-debugger.view', provider, {
                webviewOptions: { retainContextWhenHidden: true }
            })
        );
        vscode.window.showInformationMessage('DEBUG: Step 3 - Registered Provider');
        console.log('WebviewViewProvider registered');

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
            vscode.commands.executeCommand('ai-debugger.devView.focus');
        });

        // Register open panel command
        const openPanelCommand = vscode.commands.registerCommand('ai-debugger.openPanel', () => {
            vscode.commands.executeCommand('ai-debugger.devView.focus');
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
        console.log('Activation completed');
    } catch (err) {
        console.error('Activation failed:', err);
        vscode.window.showErrorMessage('AI Dev Companion Activation Error: ' + err);
    }
}

class AIDebuggerViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _sessionId: string;
    private _context: vscode.ExtensionContext;
    private _messageHistory: Message[] = [];
    private _autoDebugEnabled: boolean = false;
    private _llmMode: 'fast' | 'deep' = 'fast';
    private _requestLogs: { endpoint: string; mode: string; startedAt: number; durationMs: number; status: string; error?: string }[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        sessionId: string,
        context: vscode.ExtensionContext
    ) {
        this._sessionId = sessionId;
        this._context = context;
        // this.loadConversationHistory(); // DISABLE FOR DEBUGGING
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        vscode.window.showInformationMessage('DEBUG: resolveWebviewView called!');
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

    public isAutoDebugEnabled(): boolean {
        return this._autoDebugEnabled;
    }

    public async sendMessage(message: string, mode: 'tutor' | 'debugger' = 'debugger', isAutomatic: boolean = false) {
        if (!this._view) {
            return;
        }

        // Add user message to history
        const userMessage: Message = {
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
            const response = await axios.post<ChatResponse>(`${BACKEND_URL}${endpoint}`, {
                session_id: this._sessionId,
                query: message,
                mode: this._llmMode
            });

            const aiResponse = response.data;

            // Add AI response to history
            const assistantMessage: Message = {
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

        } catch (error) {
            console.error('Error communicating with backend:', error);

            const errorMessage = axios.isAxiosError(error)
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

    private async syncMessagesToBackend(userMessage: Message, assistantMessage: Message) {
        try {
            // Sync user message
            await axios.post(`${BACKEND_URL}/api/sessions/${this._sessionId}/messages`, {
                role: userMessage.role,
                content: userMessage.content,
                timestamp: userMessage.timestamp
            });

            // Sync assistant message
            await axios.post(`${BACKEND_URL}/api/sessions/${this._sessionId}/messages`, {
                role: assistantMessage.role,
                content: assistantMessage.content,
                timestamp: assistantMessage.timestamp
            });

            console.log('Messages synced to backend successfully');
        } catch (error) {
            console.error('Failed to sync messages to backend:', error);
        }
    }

    private async loadConversationHistory() {
        try {
            const response = await axios.get(`${BACKEND_URL}/api/sessions/${this._sessionId}/messages`);
            this._messageHistory = response.data.messages || [];
            console.log(`Loaded ${this._messageHistory.length} messages from backend`);
        } catch (error) {
            console.error('Failed to load conversation history:', error);
            this._messageHistory = [];
        }
    }

    private async clearHistory() {
        try {
            await axios.delete(`${BACKEND_URL}/api/sessions/${this._sessionId}/messages`);
            this._messageHistory = [];

            if (this._view) {
                this._view.webview.postMessage({
                    type: 'historyCleared'
                });
            }

            vscode.window.showInformationMessage('Conversation history cleared');
        } catch (error) {
            console.error('Failed to clear history:', error);
            vscode.window.showErrorMessage('Failed to clear conversation history');
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI DEV COMPANION</title>
    <style>
        :root {
            --primary-gradient: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            --glass-bg: rgba(255, 255, 255, 0.03);
            --glass-border: rgba(255, 255, 255, 0.1);
            --user-bubble: #312e81;
            --ai-bubble: rgba(30, 41, 59, 0.7);
            --text-main: var(--vscode-foreground);
            --text-dim: var(--vscode-descriptionForeground);
            --radius-lg: 12px;
            --radius-md: 8px;
            --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        body {
            font-family: var(--vscode-font-family), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 13px;
            color: var(--text-main);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
            line-height: 1.5;
        }

        /* Glassmorphism utility */
        .glass {
            background: var(--glass-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--glass-border);
        }

        /* Header Styling */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background-color: rgba(15, 23, 42, 0.8);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid var(--glass-border);
            z-index: 100;
        }

        .header-title {
            font-weight: 700;
            letter-spacing: 0.5px;
            font-size: 11px;
            color: #a5b4fc;
            display: flex;
            align-items: center;
            gap: 8px;
            text-transform: uppercase;
        }

        .header-logo {
            width: 20px;
            height: 20px;
            background: var(--primary-gradient);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 10px;
        }

        select#modeSelect {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #94a3b8;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 4px;
            cursor: pointer;
            outline: none;
            transition: var(--transition);
        }

        select#modeSelect:hover {
            background: rgba(255, 255, 255, 0.1);
            color: white;
        }

        /* Chat Container */
        .chat-list {
            flex: 1;
            overflow-y: auto;
            padding: 20px 16px;
            display: flex;
            flex-direction: column;
            gap: 20px;
            scroll-behavior: smooth;
        }

        .message {
            display: flex;
            flex-direction: column;
            max-width: 90%;
            animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message.user {
            align-self: flex-end;
            align-items: flex-end;
        }

        .message.assistant {
            align-self: flex-start;
            align-items: flex-start;
        }

        .message-bubble {
            padding: 10px 14px;
            border-radius: var(--radius-lg);
            position: relative;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .message.user .message-bubble {
            background: var(--primary-gradient);
            color: white;
            border-bottom-right-radius: 2px;
        }

        .message.assistant .message-bubble {
            background: var(--ai-bubble);
            border: 1px solid var(--glass-border);
            color: #e2e8f0;
            border-bottom-left-radius: 2px;
        }

        .message.error .message-bubble {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #f87171;
        }

        .timestamp {
            font-size: 10px;
            color: var(--text-dim);
            margin-top: 6px;
            opacity: 0.6;
        }

        /* Enhanced Code Block Styling */
        pre {
            background: #0f172a !important;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 12px;
            margin: 10px 0;
            overflow-x: auto;
            position: relative;
        }

        code {
            font-family: 'JetBrains Mono', 'Fira Code', var(--vscode-editor-font-family);
            font-size: 12px;
            color: #94a3b8;
        }

        /* Empty State & Welcome Cards */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 80%;
            text-align: center;
        }

        .welcome-title {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 24px;
            background: var(--primary-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .feature-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
            width: 100%;
            max-width: 320px;
        }

        .feature-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.05);
            padding: 12px 16px;
            border-radius: var(--radius-lg);
            cursor: pointer;
            text-align: left;
            transition: var(--transition);
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .feature-card:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: #6366f1;
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.15);
        }

        .feature-icon {
            width: 32px;
            height: 32px;
            background: rgba(99, 102, 241, 0.1);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #818cf8;
        }

        .feature-text {
            flex: 1;
        }

        .feature-title {
            font-weight: 600;
            font-size: 13px;
            color: #f1f5f9;
        }

        .feature-desc {
            font-size: 11px;
            color: #94a3b8;
        }

        /* Floating Input Bar */
        .input-container {
            padding: 16px;
            background: transparent;
            z-index: 10;
        }

        .input-wrapper {
            background: #1e293b;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 10px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
            transition: var(--transition);
        }

        .input-wrapper:focus-within {
            border-color: #6366f1;
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        textarea {
            background: transparent;
            border: none;
            color: white;
            font-family: inherit;
            font-size: 13px;
            resize: none;
            width: 100%;
            min-height: 24px;
            max-height: 150px;
            outline: none;
            padding: 4px;
        }

        .input-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .input-actions {
            display: flex;
            gap: 2px;
        }

        .icon-btn {
            background: transparent;
            border: none;
            color: #94a3b8;
            padding: 6px;
            border-radius: 6px;
            display: flex;
            cursor: pointer;
            transition: var(--transition);
        }

        .icon-btn:hover {
            background: rgba(255, 255, 255, 0.05);
            color: white;
        }

        .icon-btn svg { width: 16px; height: 16px; fill: currentColor; }

        .send-btn {
            background: var(--primary-gradient);
            color: white;
            border: none;
            border-radius: 10px;
            padding: 6px 14px;
            font-weight: 600;
            font-size: 12px;
            cursor: pointer;
            transition: var(--transition);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .send-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
        }

        .send-btn:active { transform: scale(0.95); }

        /* Typing Indicator */
        .typing {
            padding: 8px 12px;
            background: var(--ai-bubble);
            border-radius: 12px;
            display: flex;
            gap: 4px;
            align-self: flex-start;
            margin-bottom: 20px;
        }

        .dot {
            width: 4px;
            height: 4px;
            background: #94a3b8;
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out both;
        }
        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1.0); } }

        /* Custom Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }

        .hidden { display: none !important; }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-title">
            <div class="header-logo">A</div>
            <span>AI DEV COMPANION</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
            <select id="modeSelect">
                <option value="debugger">Debugger</option>
                <option value="tutor">Tutor</option>
            </select>
            <button class="icon-btn" id="clearBtn" title="Clear History">
                <svg viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.75 1.75 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>
            </button>
        </div>
    </div>

    <div class="chat-list" id="chatContainer">
        <!-- Empty State -->
        <div class="empty-state">
            <h1 class="welcome-title">Welcome Back</h1>
            <div class="feature-grid">
                <div class="feature-card" onclick="postMessageToExtension('explain')">
                    <div class="feature-icon">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197"/></svg>
                    </div>
                    <div class="feature-text">
                        <div class="feature-title">Explain Code</div>
                        <div class="feature-desc">Natural language walkthrough</div>
                    </div>
                </div>
                <div class="feature-card" onclick="postMessageToExtension('fix')">
                    <div class="feature-icon">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 13.5h.01m13.38 2.1l-.7-.7m.7.7l.7-.7m-.7.7l.7.7m-.7-.7l-.7.7M6.74 2.12a2 2 0 0 0-2.62 0L1.75 4.5a2 2 0 0 0 0 2.62h0a2 2 0 0 0 2.62 0l2.37-2.38a2 2 0 0 0 0-2.62zM3.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>
                    </div>
                    <div class="feature-text">
                        <div class="feature-title">Fix Bugs</div>
                        <div class="feature-desc">AI-powered debugging</div>
                    </div>
                </div>
                <div class="feature-card" onclick="postMessageToExtension('test')">
                    <div class="feature-icon">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4"/></svg>
                    </div>
                    <div class="feature-text">
                        <div class="feature-title">Generate Tests</div>
                        <div class="feature-desc">Build robust unit tests</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="typingIndicator" class="typing hidden" style="margin: 0 16px 16px;">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
    </div>

    <div class="input-container">
        <div class="input-wrapper">
            <textarea id="messageInput" placeholder="Ask your AI companion..." rows="1"></textarea>
            <div class="input-footer">
                <div class="input-actions">
                    <button class="icon-btn" id="attachBtn" title="Attach File">
                        <svg viewBox="0 0 16 16"><path d="M3.75 5.75c0-1.24 1.01-2.25 2.25-2.25h5.5c1.24 0 2.25 1.01 2.25 2.25v5.5c0 1.24-1.01 2.25-2.25 2.25h-5.5c-1.24 0-2.25-1.01-2.25-2.25v-5.5zm2.25-.75a.75.75 0 0 0-.75.75v5.5c0 .41.34.75.75.75h5.5a.75.75 0 0 0 .75-.75v-5.5a.75.75 0 0 0-.75-.75h-5.5z"/></svg>
                    </button>
                    <button class="icon-btn" id="selectionBtn" title="Use Selection">
                        <svg viewBox="0 0 16 16"><path d="M2.5 4v9h9V4h-9zm0-1.5h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5v-9a1.5 1.5 0 0 1 1.5-1.5zM12.5 2H4V.5h8.5A1.5 1.5 0 0 1 14 2v8.5h-1.5V2z"/></svg>
                    </button>
                </div>
                <button class="send-btn" id="sendBtn">
                    <span>Send</span>
                    <svg width="12" height="12" viewBox="0 0 16 16"><path fill="currentColor" d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.109z"/></svg>
                </button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const clearBtn = document.getElementById('clearBtn');
        const attachBtn = document.getElementById('attachBtn');
        const selectionBtn = document.getElementById('selectionBtn');
        const modeSelect = document.getElementById('modeSelect');
        const typingIndicator = document.getElementById('typingIndicator');

        let currentMode = 'debugger';

        // Auto-resize textarea
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        function sendMessage() {
            const text = messageInput.value.trim();
            if (!text) return;

            vscode.postMessage({
                type: 'sendMessage',
                message: text,
                mode: currentMode
            });

            messageInput.value = '';
            messageInput.style.height = 'auto';
        }

        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        clearBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'clearHistory' });
        });

        attachBtn.addEventListener('click', () => vscode.postMessage({ type: 'attachFile' }));
        selectionBtn.addEventListener('click', () => vscode.postMessage({ type: 'useSelection' }));

        modeSelect.addEventListener('change', (e) => {
            currentMode = e.target.value;
            vscode.postMessage({ type: 'setLLMMode', mode: currentMode === 'tutor' ? 'deep' : 'fast' });
        });

        window.postMessageToExtension = (action) => {
            let text = '';
            if (action === 'explain') text = 'Explain the selected code';
            if (action === 'fix') text = 'Fix bugs in this code';
            if (action === 'test') text = 'Generate unit tests for this code';
            if (text) vscode.postMessage({ type: 'sendMessage', message: text, mode: currentMode });
        };

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'userMessage':
                    removeEmptyState();
                    addMessage(message.message, 'user');
                    break;
                case 'aiResponse':
                    removeEmptyState();
                    addAIResponse(message.response, 'assistant');
                    break;
                case 'error':
                    addMessage(message.message, 'assistant error');
                    break;
                case 'typing':
                    if (message.show) typingIndicator.classList.remove('hidden');
                    else typingIndicator.classList.add('hidden');
                    scrollToBottom();
                    break;
                case 'prefill':
                    if (message.text) {
                        messageInput.value = message.text;
                        messageInput.focus();
                        messageInput.style.height = 'auto';
                        messageInput.style.height = (messageInput.scrollHeight) + 'px';
                    }
                    break;
                case 'historyLoaded':
                    chatContainer.innerHTML = ''; 
                    if(!message.messages || message.messages.length === 0) {
                        restoreEmptyState();
                    } else {
                        message.messages.forEach(msg => {
                            if (msg.role === 'user') addMessage(msg.content, 'user');
                            else addAIResponse(msg.content, 'assistant');
                        });
                        scrollToBottom();
                    }
                    break;
                case 'historyCleared':
                    chatContainer.innerHTML = '';
                    restoreEmptyState();
                    break;
            }
        });

        function removeEmptyState() {
            const es = document.querySelector('.empty-state');
            if (es) es.remove();
        }

        function restoreEmptyState() {
            if(chatContainer.querySelector('.empty-state')) return;
            chatContainer.innerHTML = \`<div class="empty-state">
                <h1 class="welcome-title">Welcome Back</h1>
                <div class="feature-grid">
                    <div class="feature-card" onclick="postMessageToExtension('explain')">
                        <div class="feature-icon">
                            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197"/></svg>
                        </div>
                        <div class="feature-text">
                            <div class="feature-title">Explain Code</div>
                            <div class="feature-desc">Natural language walkthrough</div>
                        </div>
                    </div>
                    <div class="feature-card" onclick="postMessageToExtension('fix')">
                        <div class="feature-icon">
                            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 13.5h.01m13.38 2.1l-.7-.7m.7.7l.7-.7m-.7.7l.7.7m-.7-.7l-.7.7M6.74 2.12a2 2 0 0 0-2.62 0L1.75 4.5a2 2 0 0 0 0 2.62h0a2 2 0 0 0 2.62 0l2.37-2.38a2 2 0 0 0 0-2.62zM3.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>
                        </div>
                        <div class="feature-text">
                            <div class="feature-title">Fix Bugs</div>
                            <div class="feature-desc">AI-powered debugging</div>
                        </div>
                    </div>
                    <div class="feature-card" onclick="postMessageToExtension('test')">
                        <div class="feature-icon">
                            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4"/></svg>
                        </div>
                        <div class="feature-text">
                            <div class="feature-title">Generate Tests</div>
                            <div class="feature-desc">Build robust unit tests</div>
                        </div>
                    </div>
                </div>
            </div>\`;
        }

        function addMessage(text, role) {
    const div = document.createElement('div');
    div.className = 'message ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);
    const ts = document.createElement('div');
    ts.className = 'timestamp';
    ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.appendChild(ts);
    chatContainer.appendChild(div);
    scrollToBottom();
}

        function addAIResponse(response, role) {
            const div = document.createElement('div');
            div.className = 'message ' + role;
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            
            if (typeof response === 'object' && response !== null) {
                let html = '';
                if (response.explanation) html += \`<p style="margin:0 0 10px 0"><b>Explanation:</b><br>\${escapeHtml(response.explanation)}</p>\`;
                
                if (response.stepsToFix && response.stepsToFix.length > 0) {
                    html += '<p style="margin:10px 0 5px 0"><b>Steps to fix:</b></p><ul style="margin:0; padding-left:20px;">';
                    response.stepsToFix.forEach(step => {
                        html += \`<li>\${escapeHtml(step)}</li>\`;
                    });
                    html += '</ul>';
                }

                if (response.resources && response.resources.length > 0) {
                    html += '<p style="margin:10px 0 5px 0"><b>Resources:</b></p><ul style="margin:0; padding-left:20px;">';
                    response.resources.forEach(res => {
                        html += \`<li><a href="\${escapeHtml(res)}" style="color:#a5b4fc">Link</a></li>\`;
                    });
                    html += '</ul>';
                }

                if (response.code_fix) html += \`<pre style="margin-top:10px"><code>\${escapeHtml(response.code_fix)}</code></pre>\`;
                if (response.response) html += \`<p style="margin-top:10px">\${escapeHtml(response.response)}</p>\`;
                if (!html) html = \`<pre><code>\${escapeHtml(JSON.stringify(response, null, 2))}</code></pre>\`;
                bubble.innerHTML = html;
            } else {
                bubble.innerHTML = escapeHtml(String(response));
            }

            div.appendChild(bubble);
            const ts = document.createElement('div');
            ts.className = 'timestamp';
            ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            div.appendChild(ts);
            chatContainer.appendChild(div);
            scrollToBottom();
        }

        function scrollToBottom() {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function escapeHtml(text) {
            if (!text) return '';
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }
    </script>
</body>
</html>`;
    }
}

export function deactivate() { }

