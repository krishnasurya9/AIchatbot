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
const vscode = __importStar(require("vscode"));
/**
 * Day 2 — Final extension.ts
 *
 * - captures selected text or current line
 * - creates/persists session_id in globalState (works on older Node)
 * - tries POST /api/query { session_id, query, mode } (Day2 spec)
 *   - if 404 or missing, falls back to POST /api/tutor/chat { session_id, message }
 * - displays AI reply in a persistent webview panel (reused per session)
 * - forwards both user message and assistant reply to POST /api/sessions/{session_id}/messages
 * - friendly error handling
 */
const BACKEND_BASE = "http://127.0.0.1:8000"; // change if your backend runs elsewhere
// persistent map of panels keyed by session id
const panels = new Map();
function activate(context) {
    console.log("AI Tutor Extension activated!");
    const disposable = vscode.commands.registerCommand("ai-tutor.ask", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("Open a file and select text (or place cursor on a line) first.");
            return;
        }
        // STEP 2: get selected text OR current line
        let query = editor.document.getText(editor.selection).trim();
        if (!query) {
            // no selection — use current line
            try {
                query = editor.document.lineAt(editor.selection.active.line).text.trim();
            }
            catch (e) {
                query = "";
            }
        }
        if (!query) {
            vscode.window.showInformationMessage("Select text or place the cursor on a line to ask the AI.");
            return;
        }
        // STEP 3: read or create session_id in globalState (safe UUID fallback)
        let sessionId = context.globalState.get("session_id");
        if (!sessionId) {
            sessionId = generateUUID();
            await context.globalState.update("session_id", sessionId);
            vscode.window.showInformationMessage(`New AI session created: ${sessionId}`);
        }
        // show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "AI Tutor: asking...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Sending query to backend..." });
            try {
                // STEP 4: call backend - prefer Day2 /api/query (session + mode)
                // If backend implements /api/query, use it (Day2 spec). If it returns 404 or not ok,
                // fallback to tutor endpoint which we know exists in your backend.
                const queryBody = {
                    session_id: sessionId,
                    query: query,
                    mode: "tutor" // or "debugger" depending on UI; using tutor for this flow
                };
                let assistantReply = null;
                // try /api/query first
                const queryUrl = `${BACKEND_BASE}/api/query`;
                let resp = await safeFetch(queryUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(queryBody)
                });
                if (resp && resp.status === 404) {
                    // fallback to /api/tutor/chat (your existing tutor endpoint)
                    resp = await safeFetch(`${BACKEND_BASE}/api/tutor/chat`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            session_id: sessionId,
                            message: query
                        })
                    });
                }
                if (!resp) {
                    // fetch failed (network or CORS)
                    throw new Error("Could not connect to backend (network or CORS).");
                }
                if (!resp.ok) {
                    // backend returned an error code
                    const txt = await safeText(resp);
                    throw new Error(`Backend error ${resp.status}: ${txt}`);
                }
                // parse JSON safely
                const data = await resp.json().catch(() => ({}));
                // Most backends return { reply: "..." } or similar. We attempt several fields.
                assistantReply = String(data?.reply ?? data?.text ?? data?.result ?? "");
                if (!assistantReply) {
                    // if still empty, stringify server response
                    assistantReply = JSON.stringify(data, null, 2) || "<empty response>";
                }
                // STEP 5: Display AI response in a side-panel webview (persistent per session)
                showReplyInPanel(sessionId, query, assistantReply);
                // STEP 6: Forward both user message and bot reply to session messages endpoint
                // try best-effort; do not fail whole operation if append fails
                try {
                    await appendMessageToSession(sessionId, { role: "user", content: query });
                }
                catch (e) {
                    console.warn("Failed to append user message to session:", e);
                }
                try {
                    await appendMessageToSession(sessionId, { role: "assistant", content: assistantReply });
                }
                catch (e) {
                    console.warn("Failed to append assistant message to session:", e);
                }
                vscode.window.showInformationMessage("AI Tutor: reply received.");
            }
            catch (err) {
                vscode.window.showErrorMessage("AI Tutor error: " + (err?.message ?? String(err)));
            }
        });
    });
    context.subscriptions.push(disposable);
    // nothing else to dispose
}
function deactivate() {
    // cleanup panels
    for (const p of panels.values()) {
        try {
            p.dispose();
        }
        catch { }
    }
}
/* ----------------------- helper functions ----------------------- */
async function safeFetch(url, opts) {
    try {
        // eslint-disable-next-line no-undef
        return await fetch(url, opts);
    }
    catch (err) {
        console.warn("fetch failed for", url, err);
        return null;
    }
}
async function safeText(resp) {
    try {
        return await resp.text();
    }
    catch {
        return "<no-body>";
    }
}
async function appendMessageToSession(sessionId, message) {
    const url = `${BACKEND_BASE}/api/sessions/${encodeURIComponent(sessionId)}/messages`;
    const resp = await safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message)
    });
    if (!resp || !resp.ok) {
        // throw so caller can log or ignore
        const txt = resp ? await safeText(resp) : "<no connection>";
        throw new Error(`Append message failed: ${resp?.status ?? "no connection"} ${txt}`);
    }
}
function showReplyInPanel(sessionId, userQuery, assistantReply) {
    // reuse panel if exists
    let panel = panels.get(sessionId);
    if (!panel) {
        panel = vscode.window.createWebviewPanel("aiTutorPanel", `AI Tutor — ${sessionId.substring(0, 8)}`, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true });
        panel.onDidDispose(() => {
            panels.delete(sessionId);
        });
        panels.set(sessionId, panel);
    }
    const safe = (s) => (s ? s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "");
    const now = new Date().toLocaleString();
    panel.webview.html = `<!doctype html>
<html>
<head><meta charset="utf-8" />
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial; padding: 12px; }
    .meta { color:#666; font-size:12px; margin-bottom:10px; }
    .box { background:#f7f7f7; padding:10px; border-radius:8px; white-space:pre-wrap; }
    .user { margin-bottom:8px; }
  </style>
</head>
<body>
  <div class="meta">Session: ${safe(sessionId)} · ${safe(now)}</div>
  <div class="user"><strong>You:</strong>
    <div class="box">${safe(userQuery)}</div>
  </div>
  <div class="assistant"><strong>AI:</strong>
    <div class="box">${safe(assistantReply)}</div>
  </div>
</body>
</html>`;
}
// lightweight UUID generator (RFC4122 v4-ish) fallback
function generateUUID() {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        /* eslint-disable no-bitwise */
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
//# sourceMappingURL=extension.js.map