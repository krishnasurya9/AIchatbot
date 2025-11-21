"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askBackend = askBackend;
exports.appendSessionMessage = appendSessionMessage;
// src/api.ts
const undici_1 = require("undici");
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000'; // or read from extension settings later
async function askBackend(sessionId, query, mode = 'tutor') {
    const url = `${BACKEND_URL}/api/query`;
    const body = { session_id: sessionId, query, mode };
    const res = await (0, undici_1.fetch)(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Backend error ${res.status}: ${text}`);
    }
    const data = await res.json();
    // adapt to your backend response shape - try these keys in order
    return data.answer || data.reply || data.explanation || (data.text ? data.text : JSON.stringify(data));
}
async function appendSessionMessage(sessionId, role, content) {
    const url = `${BACKEND_URL}/api/sessions/${encodeURIComponent(sessionId)}/messages`;
    const res = await (0, undici_1.fetch)(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content })
    });
    if (!res.ok) {
        const text = await res.text();
        console.warn(`Failed to append session message: ${res.status} ${text}`);
    }
}
//# sourceMappingURL=api.js.map