# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Page Assist is a Chrome MV3 extension. It embeds an AI assistant (Anthropic / OpenAI-compatible / Ollama) in a side-panel iframe. The AI has access to a set of browser tools for inspecting and manipulating the current page.

## Commands

```bash
npm run build      # Production build → dist/
npm run dev        # Watch mode (incremental rebuild)
```

No test runner or linter is configured.

To load the extension in Chrome: open `chrome://extensions/` → Enable Developer Mode → Load unpacked → select the **project root** (where `manifest.json` lives).

## Architecture

This is a Chrome Extension MV3. The extension has three independent entry points compiled by Vite into `dist/`:

| Entry | Output | Role |
|-------|--------|------|
| `src/background/background.ts` | `dist/background.js` | Service Worker — handles `chrome.debugger` API to extract element HTML/CSS via CDP |
| `src/content/content.ts` | `dist/content.js` | Content script — DOM highlight on hover/click, creates a hidden `<iframe>` that hosts the React UI |
| `src/content/content.css` | `dist/content.css` | Injected into host page — only the `.ai-extension-highlight-element` outline style |
| `overlay.html` + `src/overlay/` | `dist/overlay.html` + `dist/assets/*` | React 18 + Tailwind app rendered inside the iframe |

### Communication flow

```
Host page
  └── content.ts  ──postMessage──▶  overlay iframe (React App)
                  ◀──postMessage──
        │
        └── chrome.runtime.sendMessage ──▶  background.ts
                                       ◀── (response)
```

**content → overlay** message types: `ELEMENT_DATA`, `LOADING`, `ERROR`, `SYSTEM_MSG`, `EDITING_CHANGED`, `SELECTING_CHANGED`, `TOOL_*_RESULT`

**overlay → content** command types: `TOGGLE_SELECT`, `TOGGLE_EDIT`, `CAPTURE_FULL`, `HIGHLIGHT_NODE`, `CLOSE`, `TOOL_GET_ELEMENT_HTML`, `TOOL_GET_ELEMENT_CSS`, `TOOL_GET_FULL_PAGE_HTML`, `TOOL_HIGHLIGHT_ELEMENT`, `TOOL_EXECUTE_JS`, `TOOL_SCREENSHOT`

**content → background**: `inspectElement` (x, y) → `{ html, css, backendNodeId }` via CDP; `screenshot` → `{ dataUrl }` via `captureVisibleTab`

### Key build constraints

- `base: './'` in `vite.config.ts` is required so asset URLs in `dist/overlay.html` are relative (Chrome extensions cannot use absolute `/` paths).
- `background.js` and `content.js` must land at `dist/` root — enforced via `entryFileNames` in rollup output options.
- `content.css` output name is forced via `assetFileNames` (source entry is `content-style`, output renamed to `content.css`).
- `manifest.json` `web_accessible_resources` must include `dist/overlay.html` and `dist/assets/*` for the iframe src to be loadable from host pages.

### React overlay state (App.tsx)

All UI state lives in `App.tsx`: `elementData`, `messages`, `isSelecting`, `isEditing`, `showPreview`, `showSettings`. Child components (`Toolbar`, `HtmlPreview`, `ChatPanel`, `SettingsPanel`) are purely presentational and communicate upward via props/callbacks.

Custom Tailwind utilities (`.glass`, `.scrollbar-thin`) are defined in `src/overlay/index.css` and are available to all overlay components.

### AI / Claude integration

- `src/lib/storage.ts` — read/write `{ apiKey, baseURL, model }` to `chrome.storage.local`
- `src/lib/tools.ts` — tool schemas (`TOOL_DEFINITIONS`) passed to Claude + `executeTool()` which sends typed postMessages to content.ts and awaits `*_RESULT` responses
- `src/lib/claude.ts` — wraps `@anthropic-ai/sdk` streams; runs an agentic loop (calls → tool results → next call) until no more `tool_use` blocks; fires `StreamCallbacks` for incremental UI updates
- `src/overlay/components/SettingsPanel.tsx` — UI to configure `apiKey`, `baseURL`, `model`; persisted via `storage.ts`
- `src/overlay/components/ChatPanel.tsx` — maintains `MessageParam[]` history for the SDK; calls `runConversationTurn()` on send; streams tokens directly into the last assistant message via `appendToLastAssistant()`

The `manifest.json` requires `storage` permission for `chrome.storage.local` access.

## Development Specifications

### Build & verify
- After every non-trivial change run `npm run build` and confirm exit code 0 before declaring done.
- No test runner or linter is configured — build success is the only automated check.

### AI tool system
- All tools exposed to the AI are defined in `src/lib/tools.ts` (`TOOL_DEFINITIONS` array + `ToolName` union + `TOOL_UI_META` display list).
- Adding a new tool requires: entry in `TOOL_DEFINITIONS`, entry in `ToolName`, entry in `TOOL_UI_META`, and a handler branch in `executeTool()` (also in `tools.ts`).
- The special `ask_user` tool pauses the agentic loop and waits for a user reply via a `Promise` resolved in `ChatPanel.tsx`. It must NOT be handled by `executeTool()` — it is intercepted in `anthropic.ts` / `openai.ts` before the normal tool dispatch.

### AI provider loop
- `src/lib/ai/anthropic.ts` and `src/lib/ai/openai.ts` both run an agentic `while (continueLoop)` loop.
- `continueLoop` is set to `true` only when tool calls are present in the response. Plain text replies (`end_turn` with no tools) stop the loop naturally.
- `ask_user` tool: after receiving the user answer the loop must continue (`continueLoop = true`, `break` inner tool loop) so the AI sees the answer and responds. Do NOT `return` early after resolving `ask_user`.
- `StreamCallbacks.onAskUser` is optional; if absent, `ask_user` resolves with an empty string.

### ChatPanel streaming state
- `streamBufRef` accumulates the current streaming token buffer.
- `streamIdRef` is set to `Date.now()` when the first token of a new assistant message arrives (`null` = no message started yet).
- Before resuming after `ask_user`, reset both refs to `''` / `null` and call `setIsThinking(true)` so the next AI response renders as a fresh message.

### Ollama / OpenAI-compatible providers
- Ollama requests are proxied through the background service worker (`streamViaBackground`) to avoid CORS issues from the extension origin.
- If Ollama returns 403, the fix is to set the environment variable `OLLAMA_ORIGINS=*` and restart Ollama. This hint is shown automatically in the chat error message.

### Key conventions
- All `chrome.storage` access goes through `src/lib/storage.ts`.
- Do not add error handling for scenarios that cannot happen; trust framework guarantees.
- Keep solutions minimal — no premature abstractions, no extra configurability unless asked.
- MCP servers are loaded/saved via `loadMcpServers` / `saveMcpServers` in `storage.ts`; disabled tools via `loadDisabledTools` / `saveDisabledTools`.