# AI Page Assist

**English** | [中文](./README.zh.md)

A Chrome extension (MV3) that embeds an AI assistant into the browser side panel. Supports Anthropic Claude, OpenAI-compatible APIs, and local Ollama models. You can inspect, analyze, and interact with any web page through natural language.

## Features

### Chat Interface
- Streaming AI responses with markdown rendering
- Multiple named sessions with auto-save and history browser
- Abort in-flight requests at any time
- Raw request/response log viewer for debugging

### AI Providers
- **Anthropic Claude** — configurable model, custom base URL
- **OpenAI-compatible** — GPT-4o, local proxies, etc.
- **Ollama** — local models via `http://localhost:11434`; if you get a 403, set `OLLAMA_ORIGINS=*` and restart Ollama
- API keys and settings stored locally in `chrome.storage.local`

### Page Context
- Current page HTML auto-injected at the start of every turn (truncated to 20 000 chars)
- AI uses `query_page` to look up specific elements when the injected HTML is incomplete
- Element selector mode: click any element on the page to inspect it

### MCP Tool Support
- Connect external MCP servers (HTTP/SSE) in Settings
- Their tools are exposed to the AI alongside the built-in tools
- Individual tools can be disabled per-session

### Skills Marketplace
- 6 built-in skills: SEO Analyst, Code Reviewer, Form Automator, Data Extractor, Accessibility Checker, Shopping Assistant
- Create custom skills with a name, system prompt, and preferred tools
- Activate a skill by typing `@skillname` in the chat input — a picker appears for selection
- Active skill shown as a chip in the input box; click ✕ to deactivate
- Skills inject a system prompt supplement and tool hints into every AI turn
- ⚡ button in the toolbar opens the Marketplace panel

### AI Tabs
- When the AI opens new browser tabs (via `open_tab`), they appear in a bar above the chat input
- Close individual tabs with ✕ or use "Close all" to close them all at once

### HTML Preview Page
- Open an independent Chrome tab to preview AI-generated HTML
- Left pane: editable HTML source; right pane: live iframe render
- **Toolbar "Preview" button** — extracts the first HTML code block from the last AI message and opens/focuses the preview tab
- **"发送到预览" button on code blocks** — appears in the top-right corner of every HTML code block in AI replies
- **Real-time sync** — while AI is streaming, the preview page updates automatically (if already open)
- Communication via `chrome.storage.local` key `previewHtml`; preview page listens with `chrome.storage.onChanged`

### Ask User (Clarification)
- When the AI needs clarification before proceeding it calls `ask_user`
- Execution pauses and the question appears as an AI message
- Type your answer and send — the AI resumes automatically

---

## AI Tools

| Tool | Description |
|------|-------------|
| `get_element_html` | Outer HTML of the currently selected element |
| `get_element_css` | Computed CSS of the currently selected element |
| `get_full_page_html` | Full HTML of the entire page |
| `query_page` | Query elements by CSS selector and/or keyword |
| `highlight_element` | Highlight an element by CSS selector |
| `execute_js` | Execute arbitrary JavaScript on the page |
| `screenshot` | Capture viewport or full-page screenshot |
| `fill_input` | Fill an input/textarea (triggers React/Vue events) |
| `click_element` | Click an element by CSS selector |
| `open_url` | Navigate the tab to a URL |
| `scroll_page` | Scroll the page or a specific element |
| `get_current_datetime` | Current local date, time, and timezone |
| `fetch_url` | Fetch external URL content |
| `modify_element` | Modify DOM elements via AI-generated JS |
| `undo_last_modification` | Undo the last `modify_element` change |
| `upload_file_to_input` | Upload a base64 file to a file input |
| `ask_user` | Pause and ask the user a clarifying question |

---

## Project Structure

```
src/
  background/        # Service worker — message routing, screenshot, fetch proxy
  content/           # Content script — DOM highlight/select, tool execution
  overlay/           # React 18 side-panel UI
    components/
      ChatPanel.tsx  # Main chat UI, streaming, ask_user handling
      SettingsPanel.tsx
      HistoryPanel.tsx
  lib/
    ai/
      anthropic.ts   # Anthropic agentic loop
      openai.ts      # OpenAI-compatible agentic loop
      prompt.ts      # System prompt
      types.ts       # StreamCallbacks interface
    tools.ts         # Tool definitions (TOOL_DEFINITIONS) and executeTool()
    storage.ts       # chrome.storage helpers (sessions, settings, MCP servers)
    mcp.ts           # MCP server client (fetch tools, call tools)
overlay.html         # Entry HTML for side-panel iframe
preview.html         # Entry HTML for HTML preview page
  preview/
    PreviewApp.tsx   # Left code editor + right iframe live preview
manifest.json        # MV3 manifest
vite.config.ts       # Build config (4 entry points → plugin/)
```

---

## Setup

```bash
npm install
npm run build       # outputs to plugin/
npm run dev         # watch mode
```

Load the extension in Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select the **project root** (where `manifest.json` is)
4. Open the side panel on any page and enter your API key in Settings
