// ============================================================
// 🔧 Configuration
// ============================================================
const BACKEND_URL = "http://localhost:8000/chat";  // Your FastAPI backend /chat endpoint
const SESSIONS_URL = "http://localhost:8000/api/sessions";  // Session management endpoint

export let uploadedFileContents = {}; 
export let currentSessionId = null;  // Track current session

const escapeBackticks = (text) => text.replace(/`/g, '`');

// Initialize session on load
async function initializeSession() {
    try {
        const response = await fetch(`${SESSIONS_URL}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const session = await response.json();
        currentSessionId = session.session_id;
        console.log("✅ Session initialized:", currentSessionId);
    } catch (error) {
        console.error("❌ Failed to initialize session:", error);
        // Fallback to UUID
        currentSessionId = crypto.randomUUID();
    }
}

// Initialize session when module loads
if (typeof window !== 'undefined') {
    initializeSession();
}

// ============================================================
// 💬 UI & View Control
// ============================================================
export const toggleView = (mode) => {
    const chatDisplay = document.getElementById('chat-messages-display');
    const editorView = document.getElementById('inline-editor-view');
    const chatBtn = document.getElementById('chat-mode-btn');
    const editorBtn = document.getElementById('editor-mode-btn');

    if (mode === 'editor') {
        chatDisplay.classList.add('hidden');
        editorView.classList.remove('hidden');
        chatBtn.classList.remove('font-bold', 'text-primary', 'border-primary');
        chatBtn.classList.add('font-medium', 'text-gray-500', 'dark:text-gray-400', 'border-transparent');
        editorBtn.classList.add('font-bold', 'text-primary', 'border-primary');
        editorBtn.classList.remove('font-medium', 'text-gray-500', 'dark:text-gray-400', 'border-transparent');
    } else {
        editorView.classList.add('hidden');
        chatDisplay.classList.remove('hidden');
        editorBtn.classList.remove('font-bold', 'text-primary', 'border-primary');
        editorBtn.classList.add('font-medium', 'text-gray-500', 'dark:text-gray-400', 'border-transparent');
        chatBtn.classList.add('font-bold', 'text-primary', 'border-primary');
        chatBtn.classList.remove('font-medium', 'text-gray-500', 'dark:text-gray-400', 'border-transparent');
    }
};

// ============================================================
// 🧠 Chat Message UI Rendering
// ============================================================
const displayMessage = (text, sender, type = 'text', timestamp = null) => {
    const container = document.getElementById('chat-messages-display');
    const isUser = sender === 'user';
    const isSystem = sender === 'system';
    
    // Format timestamp
    const timeStr = timestamp ? formatTimestamp(timestamp) : formatTimestamp(new Date());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex items-start gap-3 ${isUser ? 'justify-end' : ''} ${isSystem ? 'justify-center' : ''} message-${sender}`;

    // System messages are simpler
    if (isSystem) {
        const systemDiv = document.createElement('div');
        systemDiv.className = 'text-xs text-gray-400 dark:text-gray-500 italic text-center w-full py-2';
        systemDiv.textContent = text;
        container.appendChild(systemDiv);
        container.scrollTop = container.scrollHeight;
        return systemDiv;
    }

    const avatarDiv = document.createElement('div');
    avatarDiv.className = `size-10 rounded-full bg-cover bg-center shrink-0 ${isUser ? 'order-2' : ''}`;
    avatarDiv.style.backgroundImage = isUser
        ? 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuB1AA7HObhItISBYSLAD-XE7tiVv0VGjF0X3_IqqPX9PoGyfA8NICXk9U17VS7nAN7xGi-gkEmnyxdiEpHtrq6ZRKWKXdDvrDoLNJJ9QGFPWphYubXOechDQCnITZX59EDC6iOLhTWpuDChjawaiaWtBqZmDXelu7t1E4C30m2lBv8RETZKY6jwbNfW8KHzhXOYx0y18EOofdpYGy9FRl_p1xlEl_yDwMsbI4dEUppM0Ld4Cn3muRITUsN0GVCkyZYgJ4Wp0QSzPjc")'
        : 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCVA6mO_BjMj794QUVgRBbXitGGveB9GbRXUF92YRdJ1aFh15sn1DRCPWnxIjgy-hIHER65ZNx_WM0ts27x6rJ0xUJ9DcSb-fY9gF5cDrgb3ibIoCAJl-qDabmV3OGhDD02j6C7DzI1mkENGfn35YOws3ObYLA-0ELfZ2QxOYUAC-MICPVxd7kiLJNvC2bJgOfi6FDXc3SDSM7Op6bUCHO4RlVXJ9ywYQU0pQwM04zF0WAfnwQDvEvf5EyhkbqqTmw2YzuIXTSARVQ")';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = `flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'} ${!isUser ? 'w-full' : ''}`;

    // Label with timestamp
    const labelRow = document.createElement('div');
    labelRow.className = `flex items-center gap-2 ${isUser ? 'flex-row-reverse' : ''}`;
    
    const label = document.createElement('p');
    label.className = `text-xs font-medium ${isUser ? 'text-primary dark:text-primary' : 'text-gray-600 dark:text-gray-400'}`;
    label.textContent = isUser ? 'You' : 'AI Assistant';
    labelRow.appendChild(label);
    
    const timeLabel = document.createElement('span');
    timeLabel.className = 'text-xs text-gray-400 dark:text-gray-500';
    timeLabel.textContent = timeStr;
    labelRow.appendChild(timeLabel);
    
    contentWrapper.appendChild(labelRow);

    // Message content with role-based styling
    const p = document.createElement('p');
    p.className = `text-sm rounded-lg p-3 ${
        isUser 
            ? 'bg-primary text-white px-4 py-3 shadow-sm' 
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
    }`;
    p.textContent = text;
    contentWrapper.appendChild(p);

    messageDiv.appendChild(isUser ? contentWrapper : avatarDiv);
    messageDiv.appendChild(isUser ? avatarDiv : contentWrapper);
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    return messageDiv;
};

// Format timestamp helper
function formatTimestamp(date) {
    if (!date) date = new Date();
    if (typeof date === 'string') date = new Date(date);
    const now = new Date();
    const diff = now - date;
    
    // Show relative time for recent messages
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    
    // Show time for today
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    
    // Show date and time for older messages
    return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit' 
    });
}

// ============================================================
// ⏳ Typing Indicator
// ============================================================
const createTypingIndicator = () => {
    const container = document.getElementById('chat-messages-display');
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'ai-typing-indicator';
    loadingDiv.className = 'flex items-start gap-3 typing-indicator';
    loadingDiv.innerHTML = `
        <div class="size-10 rounded-full bg-cover bg-center shrink-0"
            style='background-image: url("https://lh3.googleusercontent.com/aida-public/AB6AXuCVA6mO_BjMj794QUVgRBbXitGGveB9GbRXUF92YRdJ1aFh15sn1DRCPWnxIjgy-hIHER65ZNx_WM0ts27x6rJ0xUJ9DcSb-fY9gF5cDrgb3ibIoCAJl-qDabmV3OGhDD02j6C7DzI1mkENGfn35YOws3ObYLA-0ELfZ2QxOYUAC-MICPVxd7kiLJNvC2bJgOfi6FDXc3SDSM7Op6bUCHO4RlVXJ9ywYQU0pQwM04zF0WAfnwQDvEvf5EyhkbqqTmw2YzuIXTSARVQ")'></div>
        <div class="flex flex-col gap-1 items-start w-full">
            <div class="flex items-center gap-2">
                <p class="text-xs font-medium text-gray-600 dark:text-gray-400">AI Assistant</p>
                <span class="text-xs text-gray-400 dark:text-gray-500">is typing...</span>
            </div>
            <div class="text-sm rounded-lg p-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center space-x-2">
                <span class="animate-pulse h-2 w-2 bg-primary rounded-full"></span>
                <span class="animate-pulse h-2 w-2 bg-primary rounded-full delay-150"></span>
                <span class="animate-pulse h-2 w-2 bg-primary rounded-full delay-300"></span>
            </div>
        </div>`;
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;
    return loadingDiv;
};

const removeTypingIndicator = () => {
    const indicator = document.getElementById('ai-typing-indicator');
    if (indicator) {
        indicator.remove();
    }
};

// ============================================================
// 🚀 Backend Chat Integration
// ============================================================
export const sendMessage = async () => {
    console.log("sendMessage() triggered");
    const inputElement = document.getElementById('command-input');
    const modeSelector = document.getElementById('mode-selector');
    const userPrompt = inputElement.value.trim();
    if (!userPrompt) return;

    // Get selected mode (default to "deep")
    const selectedMode = modeSelector ? modeSelector.value : 'deep';

    toggleView('chat');
    const userTimestamp = new Date();
    displayMessage(userPrompt, 'user', 'text', userTimestamp);
    inputElement.value = '';

    // Show typing indicator
    const typingIndicator = createTypingIndicator();
    const requestStartTime = Date.now();

    try {
        const response = await fetch(BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: userPrompt,
                mode: selectedMode,
                session_id: currentSessionId
            }),
        });

        const requestTime = Date.now() - requestStartTime;
        removeTypingIndicator();

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const botReply = data.reply || "⚠️ No response from backend.";
        const botTimestamp = new Date();
        displayMessage(botReply, 'ai', 'text', botTimestamp);
        
        console.log(`✅ Reply received (${requestTime}ms):`, botReply);
    } catch (error) {
        console.error("❌ Backend Error:", error);
        removeTypingIndicator();
        displayMessage("⚠️ Unable to reach backend. Please ensure FastAPI is running.", 'ai', 'text', new Date());
    }
};

// ============================================================
// 🗑️ Clear Session
// ============================================================
export const clearSession = async () => {
    if (!currentSessionId) {
        console.warn("No session ID to clear");
        return;
    }

    try {
        const response = await fetch(`${SESSIONS_URL}/${currentSessionId}/clear`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ Session cleared:", result);

        // Clear local UI
        const container = document.getElementById('chat-messages-display');
        container.innerHTML = '';
        
        // Show system message
        displayMessage("Session cleared. Starting fresh conversation.", 'system');
        
        // Create new session
        await initializeSession();
    } catch (error) {
        console.error("❌ Failed to clear session:", error);
        displayMessage("⚠️ Failed to clear session. Please try again.", 'system');
    }
};

// ============================================================
// 🗂️ Placeholder: Folder Upload
// ============================================================
export const handleFolderUpload = async (event) => {
    console.log("📁 handleFolderUpload triggered. Files selected:", event?.target?.files?.length || 0);
    alert("Folder upload feature is disabled in this integration build.");
};

// ============================================================
// 🧩 Placeholder: Command Center
// ============================================================
export const handleCommandCenter = async () => {
    const input = document.getElementById("command-input");
    const userCommand = input.value.trim();
    if (!userCommand) return;
    
    console.log("⚙️ handleCommandCenter triggered with:", userCommand);
    input.value = "";
    alert("CommandCenter is not active in this mode. Your message: " + userCommand);
};
