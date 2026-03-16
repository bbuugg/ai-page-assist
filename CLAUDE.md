# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

- After developing a major feature, you should run "npx tsc" and "npm run build".