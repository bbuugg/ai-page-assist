# AI Page Assist

**English** | [中文](./README.zh.md)

A Chrome extension (MV3) that embeds an AI assistant into the browser side panel. Supports Anthropic Claude, OpenAI-compatible APIs, and local Ollama models. Use natural language to inspect, analyze, and automate any web page.

## Features

### Chat Interface
- Streaming AI responses with markdown rendering
- Multiple named sessions with auto-save and history browser
- Context compression to manage long conversations
- Abort in-flight requests at any time
- Raw request/response log viewer for debugging
- Data desensitization: sensitive values (emails, phone numbers, ID cards, secrets) are encoded before being sent to the AI and decoded in responses

### AI Providers
- **Anthropic Claude** — configurable model, extended thinking mode, custom base URL
- **OpenAI-compatible** — GPT-4o, local proxies, etc.
- **Ollama** — local models via `http://localhost:11434`; if you get a 403, set `OLLAMA_ORIGINS=*` and restart Ollama
- API keys and settings stored locally in `chrome.storage.local`

### Agents
- 10 built-in agents: SEO Analyst, Code Reviewer, Form Automator, Data Extractor, Accessibility Checker, Shopping Assistant, Browser Operator, API Doc Writer, API Debugger, PPT Generator
- Create custom agents with a name, system prompt, and preferred tools
- Activate an agent by typing `@agentname` in the chat input — a picker appears for selection
- Active agent shown as a chip in the input box; click ✕ to deactivate
- Each agent injects a tailored system prompt and tool hints into the AI turn
- Agents that use page tools automatically receive page context; pure-chat agents do not
- ⚡ button in the toolbar opens the Agents panel

### Page Context
- Page context (URL, title, visible text summary) is injected only when an agent that uses page tools is active — not on every turn
- Element selector mode: click any element on the page to inspect it

### MCP Tool Support
- Connect external MCP servers (HTTP/SSE) in Settings
- Their tools are exposed to the AI alongside the built-in tools
- Individual tools can be disabled per-session

### AI Tabs
- When the AI opens new browser tabs (via `open_tab`), they appear in a bar above the chat input
- Close individual tabs with ✕ or use "Close all" to close them all at once

### HTML Preview Page
- Open an independent Chrome tab to preview AI-generated HTML
- Left pane: editable HTML source; right pane: live iframe render
- **Toolbar "Preview" button** — extracts the HTML code block from the last AI message, opens/focuses the preview tab
- **"Send to Preview" button** — quick button on every HTML code block in AI replies
- **Live sync** — preview page updates automatically while the AI streams (if already open)

### Ask User (Clarification)
- When the AI needs clarification before proceeding, it calls the `ask_user` tool
- Execution pauses and the question appears as an AI message
- Yes/No questions show quick-reply buttons
- Type your answer and send to resume

### Session Replay
- Export tool call sequences from any session as JSON or JS script
- Replay a previous session's tool steps against the current page
- Pause, resume, or stop replay at any time

---

## AI Tools

| Tool | Description |
|------|-------------|
| `get_element_html` | Get the outer HTML of the currently selected element |
| `get_element_css` | Get the computed CSS of the currently selected element |
| `get_full_page_html` | Get the full outer HTML of the entire page |
| `get_page_context` | Get the current page URL, title, and visible text summary |
| `get_dom_state` | Get a structured summary of page state: title, URL, and interactive elements |
| `query_page` | Search elements by CSS selector or keyword |
| `extract_page_elements` | Extract structured element info (tag, id, class, text, HTML) by selectors/keywords |
| `execute_js` | Execute JavaScript in the page context |
| `click_element` | Click an element by CSS selector |
| `fill_input` | Fill an input or textarea (triggers React/Vue event listeners) |
| `clear_input` | Clear an input or textarea |
| `select_option` | Select an option in a `<select>` element |
| `send_keys` | Send keyboard events to an element or the focused element |
| `hover_element` | Hover over an element by CSS selector |
| `drag_and_drop` | Drag one element and drop it onto another |
| `scroll_page` | Scroll the page or a specific element |
| `scroll_to_element` | Scroll an element into view |
| `wait_for_element` | Wait for an element to appear in the DOM |
| `open_url` | Navigate the current tab to a URL |
| `open_tab` | Open a new browser tab |
| `close_tab` | Close a browser tab |
| `switch_tab` | Switch to a browser tab by ID |
| `list_tabs` | List all open tabs with IDs, titles, and URLs |
| `go_back` | Navigate back in browser history |
| `go_forward` | Navigate forward in browser history |
| `refresh` | Reload the current tab |
| `fetch_url` | Fetch content from an external URL |
| `get_current_datetime` | Get the current local date, time, and timezone |
| `preview_get_html` | Get the current HTML source of the HTML preview page |
| `preview_exec_js` | Execute JS inside the HTML preview page iframe |
| `ask_user` | Pause execution and ask the user a question |

---

## Project Structure

```
src/
  background/
    background.ts      # Service worker — CDP, scripting, AI tabs tracking
  content/
    content.ts         # Content script — DOM highlight, tool execution, AI effects
    ai-effects.ts      # Scan border effect + virtual AI cursor animations
    tool-handlers.ts   # Browser tool implementations (click, fill, etc.)
    dom-utils.ts       # CSS selector resolution
  overlay/
    App.tsx            # Sessions, aiTabs state, message routing
    store.ts           # Zustand store (per-session + shared state)
    components/
      ChatPanel.tsx    # Chat UI, streaming, @mention picker, agent chip
      SettingsPanel.tsx
      SkillsPanel.tsx  # Agents Marketplace panel
      Toolbar.tsx
      HtmlPreview.tsx
  lib/
    ai/
      anthropic.ts     # Anthropic agentic loop
      openai.ts        # OpenAI-compatible agentic loop
      prompt.ts        # System prompt
      types.ts         # StreamCallbacks interface
      compress.ts      # Context compression
    tools/
      definitions/     # Individual tool definitions
      registry.ts      # Tool registry (ALL_TOOLS)
      index.ts         # TOOL_DEFINITIONS + executeTool()
    agents/
      index.ts         # Agent interface, BUILTIN_AGENTS, buildAgentSystemPrompt()
      builtin/         # Built-in agent definitions
    storage.ts         # chrome.storage helpers
    mcp.ts             # MCP server client
    desensitize.ts     # Data desensitization (encode/decode)
overlay.html           # Entry HTML for side-panel iframe
preview.html           # Entry HTML for HTML preview page
manifest.json          # MV3 manifest
vite.config.ts         # Build config (multiple entry points → plugin/)
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
