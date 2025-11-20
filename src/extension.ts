// src/extension.ts
import * as vscode from 'vscode';
import { askBackend, appendSessionMessage } from './api';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
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
    let sessionId = context.globalState.get<string>('session_id');
    if (!sessionId) {
      sessionId = uuidv4();
      await context.globalState.update('session_id', sessionId);
    }

    // show or create the webview panel
    panel = getOrCreatePanel(context, panel);

    // Optimistic: show user's message in panel
    panel.webview.postMessage({ type: 'userMessage', payload: { content: selection } });

    // append user message to backend session store
    appendSessionMessage(sessionId, 'user', selection).catch(e => console.warn('append user failed', e));

    // call backend
    try {
      const reply = await askBackend(sessionId, selection, 'tutor');
      // append bot reply to backend session store
      appendSessionMessage(sessionId, 'bot', reply).catch(e => console.warn('append bot failed', e));
      // send reply to webview
      panel.webview.postMessage({ type: 'botReply', payload: { content: reply } });
    } catch (err: any) {
      vscode.window.showErrorMessage('AI Tutor failed: ' + (err.message || String(err)));
      panel.webview.postMessage({ type: 'botReply', payload: { content: 'Error: failed to get reply' } });
    }
  });

  context.subscriptions.push(disposable);
}

function getOrCreatePanel(context: vscode.ExtensionContext, existing?: vscode.WebviewPanel) {
  if (existing) return existing;

  const panel = vscode.window.createWebviewPanel(
    'aiTutor',
    'AI Tutor',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
    }
  );

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

export function deactivate() {}
