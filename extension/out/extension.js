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
/* ---------------- CONFIG ---------------- */
function getBackendUrl() {
    return vscode.workspace
        .getConfiguration('ai-debugger')
        .get('backendUrl') || 'http://localhost:8000';
}
/* ---------------- ACTIVATE ---------------- */
function activate(context) {
    console.log('AI Dev Companion activated');
    let sessionId = context.globalState.get('sessionId');
    if (!sessionId) {
        sessionId = (0, uuid_1.v4)();
        context.globalState.update('sessionId', sessionId);
    }
    const provider = new AIDebuggerViewProvider(context.extensionUri, sessionId, context);
    // Register webview provider
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('ai-debugger-view', provider));
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('ai-debugger.askQuestion', async () => {
        const question = await vscode.window.showInputBox({
            prompt: 'Ask your coding question',
            placeHolder: 'Type your question here...'
        });
        if (question) {
            // Send message to webview
            provider.sendMessageFromCommand(question, 'tutor');
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ai-debugger.openPanel', () => {
        // Focus the webview panel
        vscode.commands.executeCommand('ai-debugger-view.focus');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ai-debugger.open', () => {
        // Focus the webview panel
        vscode.commands.executeCommand('ai-debugger-view.focus');
    }));
}
/* ---------------- PROVIDER ---------------- */
class AIDebuggerViewProvider {
    constructor(_extensionUri, _sessionId, _context) {
        this._extensionUri = _extensionUri;
        this._sessionId = _sessionId;
        this._context = _context;
        this._autoDebugEnabled = false;
        this._llmMode = 'fast';
        this._messageHistory = [];
    }
    resolveWebviewView(view) {
        this._view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        view.webview.html = this.getHtml(view.webview);
        view.webview.onDidReceiveMessage(async (msg) => {
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
    sendMessageFromCommand(message, mode) {
        if (this._view) {
            this.sendMessage(message, mode);
        }
        else {
            vscode.window.showWarningMessage('Please open the AI Dev Companion panel first');
        }
    }
    async sendMessage(message, mode) {
        if (!this._view)
            return;
        const userMsg = {
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
            const endpoint = mode === 'tutor'
                ? '/api/tutor/chat'
                : '/api/debugger/chat';
            const res = await axios_1.default.post(getBackendUrl() + endpoint, {
                session_id: this._sessionId,
                query: message,
                mode: this._llmMode
            });
            const aiMsg = {
                role: 'assistant',
                content: res.data.response
            };
            this._messageHistory.push(aiMsg);
            this._view.webview.postMessage({
                type: 'aiResponse',
                response: res.data,
                mode
            });
        }
        catch (e) {
            const errorMessage = e.response?.data?.detail
                || e.response?.data?.message
                || e.message
                || 'Backend error occurred. Please try again.';
            this._view.webview.postMessage({
                type: 'error',
                message: errorMessage
            });
        }
        finally {
            this._view.webview.postMessage({ type: 'typing', show: false });
        }
    }
    /* ---------------- HTML ---------------- */
    getHtml(webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://unpkg.com/@phosphor-icons/web"></script>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
    :root {
        --accent-color: #8b5cf6;
        --accent-glow: rgba(139, 92, 246, 0.15);
        --glass-border: rgba(255, 255, 255, 0.08);
        --bg-color: #000000;
        --text-color: #e4e4e7;
        --secondary-text: #a1a1aa;
        --user-bubble-bg: #000000;
        --ai-bubble-bg: #0b0b0b;
        --input-bg: #000000;
        --vscode-font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
    }

    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        -webkit-font-smoothing: antialiased;
    }

    body {
        font-family: var(--vscode-font-family);
        background-color: var(--bg-color);
        color: var(--text-color);
        height: 100vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background-image: 
            radial-gradient(circle at 50% -20%, rgba(120, 119, 198, 0.1), transparent 40%),
            radial-gradient(circle at 100% 0%, rgba(255, 255, 255, 0.03), transparent 20%);
    }

    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }

    .header {
        padding: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--glass-border);
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
        z-index: 10;
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .logo {
        width: 24px;
        height: 24px;
        background: #000;
        border: 1px solid var(--glass-border);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 15px rgba(255, 255, 255, 0.05);
    }

    .logo i {
        font-size: 14px;
        color: #fff;
    }

    .brand-text h1 {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: -0.02em;
    }

    .status {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .status-dot {
        width: 4px;
        height: 4px;
        background: #10b981;
        border-radius: 50%;
        box-shadow: 0 0 5px rgba(16, 185, 129, 0.5);
    }

    .status-text {
        font-size: 8px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--secondary-text);
        font-weight: 600;
    }

    .mode-tabs {
        display: flex;
        gap: 2px;
        padding: 4px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        margin: 12px 16px;
    }

    .tab {
        flex: 1;
        padding: 6px;
        border: none;
        background: transparent;
        color: var(--secondary-text);
        font-size: 11px;
        font-weight: 500;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
    }

    .tab.active {
        background: rgba(255, 255, 255, 0.07);
        color: #fff;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .tab i { font-size: 14px; }

    .chat-container {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    .message {
        max-width: 90%;
        display: flex;
        flex-direction: column;
        gap: 8px;
        animation: slideIn 0.3s cubic-bezier(0, 0.5, 0.5, 1);
    }

    @keyframes slideIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .message.user { align-self: flex-end; }
    .message.assistant { align-self: flex-start; }

    .bubble {
        padding: 12px 16px;
        font-size: 13px;
        line-height: 1.6;
        position: relative;
    }

    .message.user .bubble {
        background: var(--user-bubble-bg);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 18px 18px 4px 18px;
        color: #fff;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    }

    .message.assistant .bubble {
        background: var(--ai-bubble-bg);
        border: 1px solid var(--glass-border);
        border-radius: 18px 18px 18px 4px;
        color: var(--text-color);
    }

    .message.error .bubble {
        border-color: rgba(239, 68, 68, 0.2);
        background: rgba(239, 68, 68, 0.05);
        color: #f87171;
    }

    .message-info {
        font-size: 10px;
        color: var(--secondary-text);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
        margin-bottom: 2px;
    }

    .message.user .message-info { text-align: right; }

    pre {
        background: #050505 !important;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        margin: 8px 0;
        overflow-x: auto;
    }

    code {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
    }

    .typing {
        display: none;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        font-size: 11px;
        color: var(--secondary-text);
        font-family: 'Space Grotesk', serif;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }

    .typing.show { display: flex; }

    .dots {
        display: flex;
        gap: 3px;
    }

    .dot {
        width: 3px;
        height: 3px;
        background: var(--accent-color);
        border-radius: 50%;
        animation: bounce 1.4s infinite;
    }

    @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.3; } 40% { transform: translateY(-4px); opacity: 1; } }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }

    .footer {
        padding: 16px;
        border-top: 1px solid var(--glass-border);
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
    }

    .input-wrapper {
        background: var(--input-bg);
        border: 1px solid var(--glass-border);
        border-radius: 16px;
        padding: 8px;
        transition: all 0.3s;
        box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
    }

    .input-wrapper:focus-within {
        border-color: rgba(255, 255, 255, 0.2);
        box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.5), 0 0 20px rgba(139, 92, 246, 0.05);
    }

    textarea {
        width: 100%;
        background: transparent;
        border: none;
        color: #fff;
        resize: none;
        padding: 8px 12px;
        font-family: 'Space Grotesk', sans-serif;
        font-size: 13px;
        line-height: 1.5;
        min-height: 48px;
        max-height: 200px;
    }

    textarea:focus { outline: none; }

    .actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
    }

    .left-actions { display: flex; gap: 8px; }

    .icon-btn {
        background: transparent;
        border: none;
        color: var(--secondary-text);
        cursor: pointer;
        padding: 6px;
        border-radius: 6px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .icon-btn:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #fff;
    }

    .send-btn {
        background: #fff;
        color: #000;
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .send-btn:hover {
        transform: scale(1.05) translateX(2px);
        background: #f4f4f5;
    }

    .send-btn i { font-size: 16px; }

    .welcome {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 40px 20px;
        gap: 20px;
    }

    .welcome-icon {
        width: 64px;
        height: 64px;
        background: #000;
        border: 1px solid var(--glass-border);
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        color: var(--secondary-text);
        position: relative;
    }

    .welcome-icon::after {
        content: '';
        position: absolute;
        inset: -10px;
        background: radial-gradient(circle, var(--accent-glow), transparent 70%);
        z-index: -1;
    }

    .welcome h2 {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin-bottom: 4px;
    }

    .welcome p {
        font-size: 12px;
        color: var(--secondary-text);
        line-height: 1.6;
        max-width: 200px;
    }
</style>
</head>
<body>
    <div class="header">
        <div class="brand">
            <div class="logo"><i class="ph ph-asterisk-simple"></i></div>
            <div class="brand-text">
                <h1>DevHub <span style="color:#71717a">OS</span></h1>
            </div>
        </div>
        <div class="status">
            <div class="status-dot"></div>
            <span class="status-text">Connected</span>
        </div>
    </div>

    <div class="mode-tabs">
        <button class="tab active" data-mode="debugger">
            <i class="ph ph-bug"></i>
            Debugger
        </button>
        <button class="tab" data-mode="tutor">
            <i class="ph ph-book-open"></i>
            Tutor
        </button>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="welcome">
            <div class="welcome-icon"><i class="ph ph-terminal-window"></i></div>
            <div class="welcome-content">
                <h2>System Ready</h2>
                <p>Select a mode above and start coding with AI assistance.</p>
            </div>
        </div>
    </div>

    <div class="typing" id="typingIndicator">
        <div class="dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>
        <span>Thinking...</span>
    </div>

    <div class="footer">
        <div class="input-wrapper">
            <textarea id="messageInput" placeholder="Input command..." rows="1"></textarea>
            <div class="actions">
                <div class="left-actions">
                    <button class="icon-btn" id="clearBtn" title="Clear Chat History">
                        <i class="ph ph-trash"></i>
                    </button>
                    <button class="icon-btn" title="Add File Context">
                        <i class="ph ph-file-plus"></i>
                    </button>
                </div>
                <button class="send-btn" id="sendBtn">
                    <i class="ph ph-arrow-right"></i>
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
        const typingIndicator = document.getElementById('typingIndicator');
        const modeTabs = document.querySelectorAll('.tab');

        let currentMode = 'debugger';
        let hasMessages = false;

        // Auto-focus input
        messageInput.focus();

        // Mode switching
        modeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                modeTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentMode = tab.dataset.mode;
            });
        });

        // Auto-resize textarea
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
        });

        // Send logic
        function handleSend() {
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

        sendBtn.addEventListener('click', handleSend);
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        // Clear logic
        clearBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'clearHistory' });
        });

        // Message rendering
        function addMessage(role, content, isError = false) {
            if (!hasMessages) {
                chatContainer.innerHTML = '';
                hasMessages = true;
            }

            const msgDiv = document.createElement('div');
            msgDiv.className = \`message \${role} \${isError ? 'error' : ''}\`;
            
            const info = document.createElement('div');
            info.className = 'message-info';
            info.textContent = isError ? 'Error' : (role === 'user' ? 'You' : 'DevHub');
            
            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            
            // Basic markdown-like handling
            let formatted = content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>')
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                .replace(/\\n/g, '<br>');

            bubble.innerHTML = formatted;
            
            msgDiv.appendChild(info);
            msgDiv.appendChild(bubble);
            chatContainer.appendChild(msgDiv);
            
            // Scroll to bottom
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.type) {
                case 'userMessage':
                    addMessage('user', msg.message);
                    break;
                case 'aiResponse':
                    const reply = msg.response.response || 'No response';
                    addMessage('assistant', reply);
                    break;
                case 'error':
                    addMessage('assistant', msg.message, true);
                    break;
                case 'typing':
                    if (msg.show) typingIndicator.classList.add('show');
                    else typingIndicator.classList.remove('show');
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                    break;
                case 'historyCleared':
                    chatContainer.innerHTML = \`<div class="welcome">
                        <div class="welcome-icon"><i class="ph ph-terminal-window"></i></div>
                        <div class="welcome-content">
                            <h2>System Ready</h2>
                            <p>Select a mode above and start coding with AI assistance.</p>
                        </div>
                    </div>\`;
                    hasMessages = false;
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map