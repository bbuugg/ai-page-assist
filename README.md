# AI Page Inspector

A Chrome extension that embeds an AI assistant (Claude or GPT-4o) into your browser. You can inspect, analyze, and interact with any web page through natural language.

## Features

### Chat Interface
- Side-panel chat UI with streaming AI responses
- Multiple named sessions with auto-save and history browser
- New chat, switch session, delete session
- Settings panel to configure AI provider and API key

### AI Providers
- **Anthropic Claude** (default) — configurable model
- **OpenAI GPT-4o** — configurable model
- API keys stored locally in Chrome storage

### Page Context Injection
Every conversation turn automatically injects the current page HTML so the AI can answer questions about the page without you having to describe it.

---

## AI Tools

The AI can use the following tools to interact with the page:

| Tool | Description |
|------|-------------|
| `get_element_html` | Get outer HTML of the currently selected element |
| `get_element_css` | Get computed CSS of the currently selected element |
| `get_full_page_html` | Get full HTML of the entire page |
| `highlight_element` | Highlight an element by CSS selector (with animated AI cursor) |
| `execute_js` | Execute arbitrary JavaScript on the page |
| `screenshot` | Capture a screenshot (viewport or full page) |
| `fill_input` | Fill text into an input or textarea, triggering React/Vue events |
| `click_element` | Click an element by CSS selector |
| `open_url` | Navigate the current tab to a URL |
| `scroll_page` | Scroll the page or a specific element |
| `get_current_datetime` | Get current local date, time, and timezone |
| `fetch_url` | Fetch content from any URL (strips HTML by default) |
| `modify_element` | Modify DOM elements via AI-generated JS with undo support |
| `undo_last_modification` | Undo the last `modify_element` change |
| `upload_file_to_input` | Upload a base64-encoded file to a file input element |

---

## Project Structure

```
src/
  background/   # Service worker — message routing, screenshot, fetch
  content/       # Content script — DOM interaction, tool execution
  overlay/       # React side-panel UI (chat, settings, history)
  lib/
    ai/          # AI provider clients (Anthropic, OpenAI) and prompt
    tools.ts     # Tool definitions and executor
    storage.ts   # Session persistence via chrome.storage
```

## Setup

1. Install dependencies: `pnpm install`
2. Build: `pnpm build`
3. Load the `dist/` folder as an unpacked extension in Chrome
4. Open the side panel and enter your Anthropic or OpenAI API key in Settings
