// ============================================================
// 🔧 Configuration
// ============================================================
const BACKEND_URL = "http://localhost:8000/chat";  // Your FastAPI backend /chat endpoint

export let uploadedFileContents = {}; 

const escapeBackticks = (text) => text.replace(/`/g, '`');

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
const displayMessage = (text, sender, type = 'text') => {
    const container = document.getElementById('chat-messages-display');
    const isUser = sender === 'user';
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex items-start gap-3 ${isUser ? 'justify-end' : ''}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = `size-10 rounded-full bg-cover bg-center shrink-0 ${isUser ? 'order-2' : ''}`;
    avatarDiv.style.backgroundImage = isUser
        ? 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuB1AA7HObhItISBYSLAD-XE7tiVv0VGjF0X3_IqqPX9PoGyfA8NICXk9U17VS7nAN7xGi-gkEmnyxdiEpHtrq6ZRKWKXdDvrDoLNJJ9QGFPWphYubXOechDQCnITZX59EDC6iOLhTWpuDChjawaiaWtBqZmDXelu7t1E4C30m2lBv8RETZKY6jwbNfW8KHzhXOYx0y18EOofdpYGy9FRl_p1xlEl_yDwMsbI4dEUppM0Ld4Cn3muRITUsN0GVCkyZYgJ4Wp0QSzPjc")'
        : 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCVA6mO_BjMj794QUVgRBbXitGGveB9GbRXUF92YRdJ1aFh15sn1DRCPWnxIjgy-hIHER65ZNx_WM0ts27x6rJ0xUJ9DcSb-fY9gF5cDrgb3ibIoCAJl-qDabmV3OGhDD02j6C7DzI1mkENGfn35YOws3ObYLA-0ELfZ2QxOYUAC-MICPVxd7kiLJNvC2bJgOfi6FDXc3SDSM7Op6bUCHO4RlVXJ9ywYQU0pQwM04zF0WAfnwQDvEvf5EyhkbqqTmw2YzuIXTSARVQ")';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = `flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'} ${!isUser ? 'w-full' : ''}`;

    const label = document.createElement('p');
    label.className = 'text-xs text-gray-500 dark:text-gray-400';
    label.textContent = isUser ? 'Developer' : 'AI Assistant';
    contentWrapper.appendChild(label);

    const p = document.createElement('p');
    p.className = `text-sm rounded-lg p-3 ${isUser ? 'bg-primary text-white px-4 py-3' : 'bg-primary/10 dark:bg-primary/20'}`;
    p.textContent = text;
    contentWrapper.appendChild(p);

    messageDiv.appendChild(isUser ? contentWrapper : avatarDiv);
    messageDiv.appendChild(isUser ? avatarDiv : contentWrapper);
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    return messageDiv;
};

// ============================================================
// ⏳ Loading Indicator
// ============================================================
const createLoadingIndicator = () => {
    const container = document.getElementById('chat-messages-display');
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'ai-loading-indicator';
    loadingDiv.className = 'flex items-start gap-3';
    loadingDiv.innerHTML = `
        <div class="size-10 rounded-full bg-cover bg-center shrink-0"
            style='background-image: url("https://lh3.googleusercontent.com/aida-public/AB6AXuCVA6mO_BjMj794QUVgRBbXitGGveB9GbRXUF92YRdJ1aFh15sn1DRCPWnxIjgy-hIHER65ZNx_WM0ts27x6rJ0xUJ9DcSb-fY9gF5cDrgb3ibIoCAJl-qDabmV3OGhDD02j6C7DzI1mkENGfn35YOws3ObYLA-0ELfZ2QxOYUAC-MICPVxd7kiLJNvC2bJgOfi6FDXc3SDSM7Op6bUCHO4RlVXJ9ywYQU0pQwM04zF0WAfnwQDvEvf5EyhkbqqTmw2YzuIXTSARVQ")'></div>
        <div class="flex flex-col gap-1 items-start">
            <p class="text-xs text-gray-500 dark:text-gray-400">AI Assistant</p>
            <div class="text-sm rounded-lg p-3 bg-primary/10 dark:bg-primary/20 flex items-center space-x-2">
                <span class="animate-pulse h-3 w-3 bg-primary rounded-full"></span>
                <span class="animate-pulse h-3 w-3 bg-primary rounded-full delay-150"></span>
                <span class="animate-pulse h-3 w-3 bg-primary rounded-full delay-300"></span>
            </div>
        </div>`;
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;
    return loadingDiv;
};

// ============================================================
// 🚀 Backend Chat Integration
// ============================================================
export const sendMessage = async () => {
    console.log("sendMessage() triggered");
    const inputElement = document.getElementById('command-input');
    const userPrompt = inputElement.value.trim();
    if (!userPrompt) return;

    toggleView('chat');
    displayMessage(userPrompt, 'user');
    inputElement.value = '';

    const loadingIndicator = createLoadingIndicator();

    try {
        const response = await fetch(BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userPrompt }),
        });

        const data = await response.json();
        loadingIndicator.remove();

        const botReply = data.reply || "⚠️ No response from backend.";
        displayMessage(botReply, 'ai', 'text');
        console.log("✅ Reply received from backend:", botReply);
    } catch (error) {
        console.error("❌ Backend Error:", error);
        loadingIndicator.remove();
        displayMessage("⚠️ Unable to reach backend. Please ensure FastAPI is running.", 'ai', 'text');
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
