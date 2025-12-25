import * as vscode from 'vscode';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

/* ---------------- CONFIG ---------------- */

function getBackendUrl(): string {
    return vscode.workspace
        .getConfiguration('ai-debugger')
        .get<string>('backendUrl') || 'http://localhost:8000';
}

/* ---------------- TYPES ---------------- */

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

/* ---------------- ACTIVATE ---------------- */

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Dev Companion activated');

    let sessionId = context.globalState.get<string>('sessionId');
    if (!sessionId) {
        sessionId = uuidv4();
        context.globalState.update('sessionId', sessionId);
    }

    const provider = new AIDebuggerViewProvider(
        context.extensionUri,
        sessionId,
        context
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'ai-debugger-view',
            provider
        )
    );
}

/* ---------------- PROVIDER ---------------- */

class AIDebuggerViewProvider implements vscode.WebviewViewProvider {

    private _view?: vscode.WebviewView;
    private _autoDebugEnabled = false;
    private _llmMode: 'fast' | 'deep' = 'fast';
    private _messageHistory: Message[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _sessionId: string,
        private readonly _context: vscode.ExtensionContext
    ) {}

    resolveWebviewView(view: vscode.WebviewView) {
        this._view = view;

        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        view.webview.html = this.getHtml(view.webview);

        view.webview.onDidReceiveMessage(async msg => {
            switch (msg.type) {

                case 'sendMessage':
                    await this.sendMessage(msg.message, msg.mode);
                    break;

                case 'toggleAutoDebug':
                    this._autoDebugEnabled = !!msg.enabled;
                    break;

                case 'setLLMMode':
                    if (msg.mode === 'fast' || msg.mode === 'deep') {
                        this._llmMode = msg.mode;
                    }
                    break;

                case 'clearHistory':
                    this._messageHistory = [];
                    view.webview.postMessage({ type: 'historyCleared' });
                    break;

                case 'getHistory':
                    view.webview.postMessage({
                        type: 'historyLoaded',
                        messages: this._messageHistory
                    });
                    break;
            }
        });
    }

    private async sendMessage(
        message: string,
        mode: 'debugger' | 'tutor'
    ) {
        if (!this._view) return;

        const userMsg: Message = {
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        };

        this._messageHistory.push(userMsg);
        this._view.webview.postMessage({
            type: 'userMessage',
            message
        });

        try {
            this._view.webview.postMessage({ type: 'typing', show: true });

            const endpoint =
                mode === 'tutor'
                    ? '/api/tutor/chat'
                    : '/api/debugger/chat';

            const res = await axios.post<ChatResponse>(
                getBackendUrl() + endpoint,
                {
                    session_id: this._sessionId,
                    query: message,
                    mode: this._llmMode
                }
            );

            const aiMsg: Message = {
                role: 'assistant',
                content: res.data.response
            };

            this._messageHistory.push(aiMsg);

            this._view.webview.postMessage({
                type: 'aiResponse',
                response: res.data,
                mode
            });

        } catch (e: any) {
            const errorMessage = e.response?.data?.detail 
                || e.response?.data?.message 
                || e.message 
                || 'Backend error occurred. Please try again.';
            
            this._view.webview.postMessage({
                type: 'error',
                message: errorMessage
            });
        } finally {
            this._view.webview.postMessage({ type: 'typing', show: false });
        }
    }

    /* ---------------- HTML ---------------- */

    private getHtml(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src 'unsafe-inline';
               script-src 'unsafe-inline';">
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
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 12px;
        display: flex;
        flex-direction: column;
        height: 100vh;
        overflow: hidden;
    }

    .header {
        margin-bottom: 16px;
    }

    .title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 12px;
        color: var(--vscode-foreground);
    }

    .mode-selector {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
    }

    .mode-btn {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid var(--vscode-button-border);
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        cursor: pointer;
        border-radius: 4px;
        font-size: 13px;
        transition: all 0.2s;
    }

    .mode-btn:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }

    .mode-btn.active {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-color: var(--vscode-focusBorder);
    }

    .chat-container {
        flex: 1;
        overflow-y: auto;
        margin-bottom: 12px;
        padding: 8px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        background: var(--vscode-editor-background);
    }

    .message {
        margin-bottom: 16px;
        animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .message-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
    }

    .message-role {
        font-weight: 600;
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 3px;
    }

    .message-role.user {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
    }

    .message-role.assistant {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }

    .message-time {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
    }

    .message-content {
        padding: 8px 12px;
        background: var(--vscode-input-background);
        border-radius: 4px;
        border-left: 3px solid var(--vscode-focusBorder);
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
    }

    .message.user .message-content {
        border-left-color: var(--vscode-button-background);
    }

    .message.assistant .message-content {
        border-left-color: var(--vscode-button-secondaryBackground);
    }

    .message.error .message-content {
        background: rgba(255, 0, 0, 0.1);
        border-left-color: var(--vscode-errorForeground);
        color: var(--vscode-errorForeground);
    }

    code {
        background: var(--vscode-textCodeBlock-background);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
    }

    .typing-indicator {
        display: none;
        padding: 8px 12px;
        background: var(--vscode-input-background);
        border-radius: 4px;
        margin-bottom: 12px;
    }

    .typing-indicator.show {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .typing-dots {
        display: flex;
        gap: 4px;
    }

    .typing-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--vscode-button-secondaryForeground);
        animation: typing 1.4s infinite;
    }

    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
        0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
        30% { opacity: 1; transform: translateY(-6px); }
    }

    .input-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    #messageInput {
        width: 100%;
        min-height: 80px;
        padding: 10px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        font-family: var(--vscode-font-family);
        font-size: 13px;
        resize: vertical;
    }

    #messageInput:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
    }

    .button-row {
        display: flex;
        gap: 8px;
    }

    button {
        padding: 8px 16px;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: background 0.2s;
    }

    button:hover {
        background: var(--vscode-button-hoverBackground);
    }

    button:active {
        transform: scale(0.98);
    }

    #sendBtn {
        flex: 1;
    }

    #clearBtn {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }

    #clearBtn:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--vscode-descriptionForeground);
        text-align: center;
        padding: 20px;
    }

    .empty-state-icon {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
    }

    .empty-state-text {
        font-size: 14px;
        line-height: 1.6;
    }
</style>
</head>

<body>
    <div class="header">
        <div class="title">🤖 AI Dev Companion</div>
        <div class="mode-selector">
            <button class="mode-btn active" data-mode="debugger">🐛 Debugger</button>
            <button class="mode-btn" data-mode="tutor">📚 Tutor</button>
        </div>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <div class="empty-state-text">
                Start a conversation!<br>
                Choose <strong>Debugger</strong> for code debugging<br>
                or <strong>Tutor</strong> for learning assistance.
            </div>
        </div>
    </div>

    <div class="typing-indicator" id="typingIndicator">
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
        <span>AI is thinking...</span>
    </div>

    <div class="input-container">
        <textarea id="messageInput" placeholder="Type your message here..."></textarea>
        <div class="button-row">
            <button id="sendBtn">Send</button>
            <button id="clearBtn">Clear</button>
        </div>
    </div>

<script>
const vscode = acquireVsCodeApi();

// DOM Elements
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const messageInput = document.getElementById('messageInput');
const chatContainer = document.getElementById('chatContainer');
const typingIndicator = document.getElementById('typingIndicator');
const modeBtns = document.querySelectorAll('.mode-btn');

// State
let currentMode = 'debugger';
let hasMessages = false;

// Mode Selection
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
    });
});

// Send Message
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

// Auto-resize textarea
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
});

// Clear History
clearBtn.addEventListener('click', () => {
    if (confirm('Clear all chat history?')) {
        vscode.postMessage({ type: 'clearHistory' });
    }
});

// Message Rendering
function createMessage(role, content, isError = false) {
    if (!hasMessages) {
        chatContainer.innerHTML = '';
        hasMessages = true;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = \`message \${isError ? 'error' : role}\`;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const roleLabel = isError ? 'Error' : (role === 'user' ? 'You' : 'AI Assistant');
    const roleClass = isError ? 'error' : role;

    // Format content (simple code detection)
    let formattedContent = content;
    if (content.includes('\`\`\`')) {
        // Preserve code blocks
        formattedContent = content.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>');
    }
    if (content.includes('\`') && !content.includes('\`\`\`')) {
        // Inline code
        formattedContent = formattedContent.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    }

    messageDiv.innerHTML = \`
        <div class="message-header">
            <span class="message-role \${roleClass}">\${roleLabel}</span>
            <span class="message-time">\${now}</span>
        </div>
        <div class="message-content">\${formattedContent}</div>
    \`;

    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle Messages from Extension
window.addEventListener('message', event => {
    const msg = event.data;

    switch (msg.type) {
        case 'userMessage':
            createMessage('user', escapeHtml(msg.message));
            break;

        case 'aiResponse':
            const response = msg.response.response || 'No response received';
            createMessage('assistant', escapeHtml(response));
            break;

        case 'error':
            createMessage('assistant', escapeHtml(msg.message), true);
            break;

        case 'typing':
            if (msg.show) {
                typingIndicator.classList.add('show');
            } else {
                typingIndicator.classList.remove('show');
            }
            break;

        case 'historyCleared':
            chatContainer.innerHTML = \`
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <div class="empty-state-text">
                        Start a conversation!<br>
                        Choose <strong>Debugger</strong> for code debugging<br>
                        or <strong>Tutor</strong> for learning assistance.
                    </div>
                </div>
            \`;
            hasMessages = false;
            break;
    }
});

// Focus input on load
messageInput.focus();
</script>
</body>
</html>`;
    }
}

export function deactivate() {}
