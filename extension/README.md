# AI Dev Companion - VS Code Extension

An AI-powered debugging and tutoring assistant for Visual Studio Code with shared conversation history.

## Features

- 🐛 **AI Debugger**: Get intelligent debugging assistance
- 📚 **AI Tutor**: Learn coding concepts with AI guidance
- 💬 **Chat Interface**: Beautiful, modern chat UI directly in VS Code
- 🔄 **Session Persistence**: Conversation history saved across sessions
- ⚡ **Multiple LLM Modes**: Fast and Deep modes for different needs

## Prerequisites

Before running the extension:

1. **Backend Server Running**: Ensure the AI backend is running on `http://localhost:8000`
   ```bash
   cd ../backend
   uvicorn app.main:app --reload
   ```

2. **Node.js**: Version 20.x or higher
3. **TypeScript**: Installed via npm dependencies

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Compile TypeScript

```bash
npm run compile
```

Or run in watch mode for automatic recompilation:

```bash
npm run watch
```

## Running the Extension

### Method 1: Using F5 (Recommended)

1. Open the `extension` folder in VS Code
2. Press `F5` or go to **Run → Start Debugging**
3. A new VS Code window (Extension Development Host) will open
4. Look for the AI Dev Companion icon in the Activity Bar (left sidebar)
5. Click it to open the chat assistant

### Method 2: Using Command Palette

1. Compile the extension: `npm run compile`
2. Press `F5` to launch
3. In the Extension Development Host window:
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Type "AI Dev Companion"
   - Select any of the available commands

## Available Commands

- **AI Tutor: Ask Question** (`Ctrl+Shift+A`) - Quick question prompt
- **Open AI Assistant Panel** - Opens the main chat interface
- **Open AI Debugger Assistant** - Opens the debugger view

## Configuration

Configure the backend URL in VS Code settings:

```json
{
  "ai-debugger.backendUrl": "http://localhost:8000"
}
```

## Troubleshooting

### Extension Not Loading

1. **Check compilation**: Run `npm run compile` and look for errors
2. **Check backend**: Ensure backend server is running at `http://localhost:8000`
3. **Clear cache**: Close all VS Code windows, delete `out/` folder, recompile
4. **Check logs**: View > Output > Select "Extension Host" from dropdown

### "No Debugger Available" Error

- This message about Markdown debugger is unrelated to this extension
- Click "Cancel" and look for the AI Dev Companion icon in the Activity Bar

### Backend Connection Issues

1. Verify backend is running: `curl http://localhost:8000/`
2. Check backend URL in settings
3. Review browser console in Extension Development Host (Help > Toggle Developer Tools)

## Building for Distribution

```bash
# Install vsce if not already installed
npm install -g @vscode/vsce

# Package the extension
vsce package
```

This creates a `.vsix` file that can be installed in VS Code.

## Project Structure

```
extension/
├── .vscode/           # VS Code workspace settings
│   ├── launch.json    # Debug configuration
│   └── tasks.json     # Build tasks
├── out/               # Compiled JavaScript (generated)
├── resources/         # Icons and assets
├── src/
│   ├── extension.ts   # Main extension code
│   └── test/          # Test files
├── package.json       # Extension manifest
└── tsconfig.json      # TypeScript config
```

## Development Workflow

1. Make changes to `src/extension.ts`
2. If running in watch mode, changes auto-compile
3. Press `Ctrl+R` (Windows/Linux) or `Cmd+R` (Mac) in Extension Development Host to reload
4. Test your changes

## Tech Stack

- **Language**: TypeScript
- **Framework**: VS Code Extension API
- **HTTP Client**: Axios
- **UI**: Custom HTML/CSS in Webview
- **Icons**: Phosphor Icons

## License

See main project license.
