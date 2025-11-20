// src/api.ts
import { fetch } from 'undici';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000'; // or read from extension settings later

export async function askBackend(sessionId: string, query: string, mode = 'tutor'): Promise<string> {
  const url = `${BACKEND_URL}/api/query`;
  const body = { session_id: sessionId, query, mode };

  const res = await fetch(url, {
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

export async function appendSessionMessage(sessionId: string, role: 'user' | 'bot' | 'system', content: string) {
  const url = `${BACKEND_URL}/api/sessions/${encodeURIComponent(sessionId)}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, content })
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`Failed to append session message: ${res.status} ${text}`);
  }
}
