// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Import feature logic
import { 
    sendMessage, 
    handleCommandCenter, 
    handleFolderUpload, 
    toggleView 
} from './features.js';

// Global variables
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let app, db, auth;

// --- Firebase Initialization ---
const initApp = async () => {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        await new Promise((resolve) => {
            onAuthStateChanged(auth, async (user) => {
                if (!user) {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                }
                const userId = auth.currentUser?.uid || crypto.randomUUID();
                document.getElementById('dev-id-display').textContent = `User ID: ${userId.substring(0, 8)}...`;
                resolve();
            });
        });

        console.log("✅ Firebase initialized. User ID:", auth.currentUser.uid);
    } catch (error) {
        console.error("❌ Error initializing Firebase or signing in:", error);
    }
};

// --- Event Listeners and Setup ---
window.onload = () => {
    // initApp();

    const applyFixBtn = document.getElementById('apply-fix-btn');
    const commandInput = document.getElementById('command-input');
    const folderInput = document.getElementById('folder-upload');
    const uploadButton = document.getElementById('upload-folder-btn');
    const chatModeBtn = document.getElementById('chat-mode-btn');
    const editorModeBtn = document.getElementById('editor-mode-btn');
    const runCommandBtn = document.getElementById('run-command-btn');

    // Upload Listener
    uploadButton.addEventListener('click', () => folderInput.click());
    folderInput.addEventListener('change', handleFolderUpload);

    // Tab Switch
    chatModeBtn.addEventListener('click', () => toggleView('chat'));
    editorModeBtn.addEventListener('click', () => toggleView('editor'));

    // 🔥 FIXED: Use "keydown" instead of "keypress"
    commandInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            console.log("⏎ Enter key detected — sending message...");
            sendMessage();
        }
    });

    // Manual "Run" button as backup trigger
    runCommandBtn.addEventListener('click', () => {
        console.log("▶️ Run button clicked — sending message...");
        sendMessage();
    });

    // "Apply Fix" command center button
    applyFixBtn.addEventListener('click', handleCommandCenter);
};
