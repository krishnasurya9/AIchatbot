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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// src/extension.ts
const vscode = __importStar(require("vscode"));
const api_1 = require("./api");
const uuid_1 = require("uuid");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let panel;
function activate(context) {
    const disposable = vscode.commands.registerCommand('ai-tutor.askQuestion', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Open a file and select code or place the cursor on a line.');
            return;
        }
        // capture selection or current line
        const selection = editor.document.getText(editor.selection).trim()
            || editor.document.lineAt(editor.selection.active.line).text.trim();
        if (!selection) {
            vscode.window.showInformationMessage('No code selected.');
            return;
        }
        // read or create session_id in globalState
        let sessionId = context.globalState.get('session_id');
        if (!sessionId) {
            sessionId = (0, uuid_1.v4)();
            await context.globalState.update('session_id', sessionId);
        }
        // show or create the webview panel
        panel = getOrCreatePanel(context, panel);
        // Optimistic: show user's message in panel
        panel.webview.postMessage({ type: 'userMessage', payload: { content: selection } });
        // append user message to backend session store
        (0, api_1.appendSessionMessage)(sessionId, 'user', selection).catch(e => console.warn('append user failed', e));
        // call backend
        try {
            const reply = await (0, api_1.askBackend)(sessionId, selection, 'tutor');
            // append bot reply to backend session store
            (0, api_1.appendSessionMessage)(sessionId, 'bot', reply).catch(e => console.warn('append bot failed', e));
            // send reply to webview
            panel.webview.postMessage({ type: 'botReply', payload: { content: reply } });
        }
        catch (err) {
            vscode.window.showErrorMessage('AI Tutor failed: ' + (err.message || String(err)));
            panel.webview.postMessage({ type: 'botReply', payload: { content: 'Error: failed to get reply' } });
        }
    });
    context.subscriptions.push(disposable);
}
function getOrCreatePanel(context, existing) {
    if (existing)
        return existing;
    const panel = vscode.window.createWebviewPanel('aiTutor', 'AI Tutor', vscode.ViewColumn.Beside, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
    });
    const htmlPath = path.join(context.extensionPath, 'media', 'webview.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    panel.webview.html = html;
    // receive messages from webview (if needed)
    panel.webview.onDidReceiveMessage(message => {
        // we might support actions from webview later
        console.log('Webview message', message);
    });
    return panel;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map