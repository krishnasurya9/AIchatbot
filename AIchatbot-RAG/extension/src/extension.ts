import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// A unique session ID for this VS Code instance
const sessionId = uuidv4();

// --- NEW: Base URL for the advanced AI Chatbot backend ---
const API_BASE_URL = 'http://127.0.0.1:8000/api';


export function activate(context: vscode.ExtensionContext) {
    const provider = new AI_DebuggerViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(AI_DebuggerViewProvider.viewType, provider)
    );

    // --- Linter Error Detection ---
    vscode.languages.onDidChangeDiagnostics(diagnosticChangeEvent => {
        for (const uri of diagnosticChangeEvent.uris) {
            const diagnostics = vscode.languages.getDiagnostics(uri)
                .filter(d => d.severity === vscode.DiagnosticSeverity.Error);

            if (diagnostics.length > 0) {
                const errorPayload = {
                    sessionId: sessionId,
                    errorMessage: diagnostics[0].message,
                    file: uri.fsPath,
                    line: diagnostics[0].range.start.line + 1,
                    severity: "critical"
                };
                // Send errors to the new /api/tutor/errors endpoint
                sendErrorPayload(errorPayload);
                provider.sendDiagnosticsToWebview(diagnostics);
            }
        }
    });
    
    // The 'runWithCapture' command can be connected later if needed.
    // For now, it's disabled to focus on the core integration.
    const runWithCaptureCommand = vscode.commands.registerCommand('ai-debugger.runWithCapture', async () => {
        vscode.window.showInformationMessage('Runtime error capture is not yet connected to the new backend.');
    });
    
    context.subscriptions.push(runWithCaptureCommand);
}

// Helper function to send errors to the backend
async function sendErrorPayload(error: any) {
    try {
        // --- UPDATED: Call the new /api/tutor/errors endpoint ---
        await axios.post(`${API_BASE_URL}/tutor/errors`, error);
        console.log('[AI Debugger] Successfully sent error to backend.');
    } catch (e) {
        console.error('[AI Debugger] Failed to send error to backend:', e);
    }
}


class AI_DebuggerViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'ai-debugger-view';
    private _view?: vscode.WebviewView;
    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = this._getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'askAI') {
                try {
                    webviewView.webview.postMessage({ command: 'showLoading' });
                    
                    let endpoint = '';
                    let payload: any = {};

                    // --- NEW: Logic to choose the correct endpoint and payload based on mode ---
                    if (message.mode === 'debugger') {
                        endpoint = `${API_BASE_URL}/debugger/chat`;
                        payload = {
                            session_id: sessionId, // Debugger expects 'session_id'
                            message: message.text   // Debugger expects 'message'
                        };
                    } else { // Default to tutor mode
                        endpoint = `${API_BASE_URL}/tutor/`;
                        payload = {
                            sessionId: sessionId, // Tutor expects 'sessionId'
                            question: message.text  // Tutor expects 'question'
                        };
                    }

                    const response = await axios.post(endpoint, payload);

                    // --- UPDATED: Handle the different response structures from each service ---
                    const responseData = (message.mode === 'debugger') 
                        ? { explanation: response.data.response } 
                        : response.data;
                    
                    webviewView.webview.postMessage({
                        command: 'showTutorResponse',
                        data: responseData
                    });
                } catch (error) {
                    webviewView.webview.postMessage({ command: 'showError', text: 'Error: Could not connect to the backend.' });
                }
            }
        });
    }

    public sendDiagnosticsToWebview(diagnostics: vscode.Diagnostic[]) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'showDetectedError',
                diagnostics: diagnostics.map(d => ({
                    message: d.message,
                    line: d.range.start.line + 1
                }))
            });
        }
    }

    private _getHtmlForWebview() {
        // The HTML and JavaScript logic for displaying the structured response is already correct.
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>AI Tutor</title>
            <style>
                body, html { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: var(--vscode-editor-foreground); background-color: var(--vscode-sideBar-background); }
                .container { padding: 10px; }
                textarea { width: 95%; margin-bottom: 10px; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; }
                button { width: 100%; padding: 8px; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
                #responseArea { padding: 10px; margin-top: 10px; background-color: var(--vscode-editor-background); border-radius: 4px; border: 1px solid var(--vscode-sideBar-border); }
                .mode-selector { display: flex; gap: 15px; margin-bottom: 10px; }
                .tutor-section { margin-bottom: 15px; }
                .tutor-section h3 { font-size: 1em; margin-bottom: 8px; border-bottom: 1px solid var(--vscode-sideBar-border); padding-bottom: 4px; }
                .tutor-section ul { padding-left: 20px; margin: 0; }
                .error-item { border: 1px solid var(--vscode-editorError-foreground); padding: 8px; margin-bottom: 5px; border-radius: 4px; background-color: rgba(255, 0, 0, 0.1); }
            </style>
        </head>
        <body>
            <div class="container">
                <p>Select a mode and ask a question about a detected error.</p>
                <div class="mode-selector">
                    <label><input type="radio" name="mode" value="tutor" checked> Tutor Mode</label>
                    <label><input type="radio" name="mode" value="debugger"> Debugger Mode</label>
                </div>
                <textarea id="userInput" rows="5" placeholder="e.g., Why is this happening?"></textarea>
                <button id="askButton">Ask AI Tutor</button>
                <div id="responseArea"></div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const askButton = document.getElementById('askButton');
                const responseArea = document.getElementById('responseArea');

                askButton.addEventListener('click', () => {
                    const selectedMode = document.querySelector('input[name="mode"]:checked').value;
                    vscode.postMessage({ 
                        command: 'askAI', 
                        text: document.getElementById('userInput').value,
                        mode: selectedMode
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'showLoading':
                            responseArea.innerHTML = '<p>🤖 Thinking...</p>';
                            break;
                        case 'showTutorResponse':
                            const { explanation, stepsToFix, correctedCode, resources } = message.data;
                            let html = '';
                            if (explanation) { html += '<div class="tutor-section"><h3>Explanation</h3><p>' + explanation.replace(/\\n/g, '<br>') + '</p></div>'; }
                            if (correctedCode) {
                                const sanitizedCode = correctedCode.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                                html += '<div class="tutor-section"><h3>Corrected Code</h3><pre><code>' + sanitizedCode + '</code></pre></div>';
                            }
                            if (stepsToFix && stepsToFix.length > 0) {
                                html += '<div class="tutor-section"><h3>Steps to Fix</h3><ul>';
                                stepsToFix.forEach(step => { html += '<li>' + step + '</li>'; });
                                html += '</ul></div>';
                            }
                            if (resources && resources.length > 0) {
                                html += '<div class="tutor-section"><h3>Resources</h3><ul>';
                                resources.forEach(link => { html += '<li><a href="' + link + '">' + link + '</a></li>'; });
                                html += '</ul></div>';
                            }
                            responseArea.innerHTML = html;
                            break;
                        case 'showDetectedError':
                            let errorHtml = '<h3>Detected Problems:</h3>';
                            message.diagnostics.forEach(d => {
                                errorHtml += '<div class="error-item"><strong>Error on line ' + d.line + ':</strong><br>' + d.message + '</div>';
                            });
                            responseArea.innerHTML = errorHtml;
                            break;
                        case 'showError':
                            responseArea.innerHTML = '<p style="color: var(--vscode-errorForeground);">' + message.text + '</p>';
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
export function deactivate() {}

