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
    console.log('AI Dev Companion extension is now active');

    // Initialize or retrieve persistent session ID
    let sessionId = context.globalState.get<string>('sessionId');
    if (!sessionId) {
        sessionId = uuidv4();
        context.globalState.update('sessionId', sessionId);
        console.log(`Created new session ID: ${sessionId}`);
    } else {
        console.log(`Using existing session ID: ${sessionId}`);
    }

    // Create webview provider
    const provider = new AIDebuggerViewProvider(context.extensionUri, sessionId, context);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('ai-debugger-view', provider)
    );

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

class AIDebuggerViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _sessionId: string;
    private _context: vscode.ExtensionContext;
    private _messageHistory: Message[] = [];
    private _autoDebugEnabled: boolean = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        sessionId: string,
        context: vscode.ExtensionContext
    ) {
        this._sessionId = sessionId;
        this._context = context;
        this.loadConversationHistory();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
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
            // Determine endpoint based on mode
            const endpoint = mode === 'tutor' ? '/api/tutor/chat' : '/api/debugger/chat';

            // Call backend API
            const response = await axios.post<ChatResponse>(`${BACKEND_URL}${endpoint}`, {
                session_id: this._sessionId,
                query: message,
                mode: mode
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
            padding: 8px 12px;
            background-color: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }
        
        .mode-btn {
            flex: 1;
            padding: 6px;
            font-size: 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .mode-btn.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        
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
    </style>
</head>
<body>
    <div class="header">
        <h3>🤖 AI Dev Companion</h3>
        <div class="controls">
            <div class="toggle-container">
                <label for="autoDebug">Auto-Debug</label>
                <label class="toggle">
                    <input type="checkbox" id="autoDebug">
                    <span class="slider"></span>
                </label>
            </div>
            <button id="clearBtn" title="Clear conversation history">Clear</button>
        </div>
    </div>
    
    <div class="mode-selector">
        <button class="mode-btn active" data-mode="debugger">🐛 Debugger</button>
        <button class="mode-btn" data-mode="tutor">📚 Tutor</button>
    </div>
    
    <div class="chat-container" id="chatContainer">
        <div class="empty-state">
            <h3>👋 Welcome to AI Dev Companion</h3>
            <p>Ask questions, debug code, or learn new concepts.<br>
            Select code and press <strong>Ctrl+Shift+A</strong> (Cmd+Shift+A on Mac) for quick help.</p>
        </div>
    </div>
    
    <div class="loading" id="loading">Thinking...</div>
    
    <div class="input-container">
        <textarea id="messageInput" placeholder="Ask a question or describe your problem..." rows="1"></textarea>
        <button id="sendBtn">Send</button>
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
        
        sendBtn.addEventListener('click', sendMessage);
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
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
            contentDiv.textContent = content;
            
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
                contentDiv.textContent = typeof response === 'string' ? response : response.response || JSON.stringify(response);
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

export function deactivate() {}

