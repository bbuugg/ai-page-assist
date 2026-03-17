# ask_user Yes/No Buttons Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When AI asks a yes/no question via the `ask_user` tool, show ✓ and ✗ quick-reply buttons beneath the question message instead of requiring the user to type.

**Architecture:** Add an `isAskUser?: boolean` flag to `ChatMessage`. When `onAskUser` fires, set this flag on the added message. In the message list renderer, when the last assistant message has `isAskUser: true` AND `askUserResolverRef.current` is non-null, render ✓/✗ buttons below the message. Clicking a button calls `handleSend` with the answer text ('yes' or 'no').

**Tech Stack:** TypeScript, React, Chrome Extension side panel

---

### Task 1: Add `isAskUser` flag to ChatMessage and wire it through

**Files:**
- Modify: `src/overlay/App.tsx` (ChatMessage interface)
- Modify: `src/overlay/components/ChatPanel.tsx` (onAskUser callback + message renderer)

**Step 1: Add `isAskUser` to ChatMessage interface in App.tsx**

In `src/overlay/App.tsx`, find:
```ts
export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  toolMeta?: string;
  toolResult?: string;
  rawLogs?: { request: string; response: string }[];
}
```
Add `isAskUser?: boolean;` field.

**Step 2: Set `isAskUser: true` when onAskUser fires**

In `src/overlay/components/ChatPanel.tsx`, the `onAskUser` callback (line ~419) calls `onAddMessage('assistant', question)`. Change this to use a new prop `onAddAskUserMessage` — OR simpler: add an optional 4th param to `onAddMessage` to pass extra fields.

Actually simpler: add a new prop `onAddMessage` already supports `toolMeta`. Instead, add a dedicated prop:
```ts
onMarkLastMessageAsAskUser: () => void;
```
Call it immediately after `onAddMessage('assistant', question)` inside `onAskUser`.

In `App.tsx`, implement:
```ts
function markLastMessageAsAskUser() {
  setActiveSession((prev) => {
    const msgs = [...prev.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, isAskUser: true };
    }
    return { ...prev, messages: msgs };
  });
}
```
Pass as `onMarkLastMessageAsAskUser={markLastMessageAsAskUser}` to ChatPanel.

**Step 3: Build and verify no type errors**

Run: `npm run build`

**Step 4: Commit**

```
git add -A && git commit -m "feat: add isAskUser flag to ChatMessage"
```

---

### Task 2: Render Yes/No buttons in message list

**Files:**
- Modify: `src/overlay/components/ChatPanel.tsx` (message renderer, ~line 529-552)

**Step 1: Add Yes/No button rendering after assistant message**

In the message list map, after the assistant message bubble (after the closing `</div>` of the glass bubble, before `{m.rawLogs && ...}`), add:

```tsx
{m.isAskUser && askUserResolverRef.current && (
  <div style={{ display: 'flex', gap: 8, marginTop: 6, marginLeft: 4 }}>
    <button
      onClick={() => {
        const resolve = askUserResolverRef.current;
        if (!resolve) return;
        askUserResolverRef.current = null;
        onAddMessage('user', 'Yes');
        streamBufRef.current = '';
        streamIdRef.current = null;
        setIsThinking(true);
        chrome.runtime.sendMessage({ action: 'toContent', action_inner: 'showBorderFx' });
        resolve('yes');
      }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: '50%',
        background: 'var(--msg-user-bg)', border: '1.5px solid var(--accent)',
        cursor: 'pointer', color: 'var(--accent)', fontSize: 16,
      }}
      title="Yes"
    >
      ✓
    </button>
    <button
      onClick={() => {
        const resolve = askUserResolverRef.current;
        if (!resolve) return;
        askUserResolverRef.current = null;
        onAddMessage('user', 'No');
        streamBufRef.current = '';
        streamIdRef.current = null;
        setIsThinking(true);
        chrome.runtime.sendMessage({ action: 'toContent', action_inner: 'showBorderFx' });
        resolve('no');
      }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: '50%',
        background: 'rgba(255,80,80,0.1)', border: '1.5px solid #e05',
        cursor: 'pointer', color: '#e05', fontSize: 16,
      }}
      title="No"
    >
      ✗
    </button>
  </div>
)}
```

Note: The buttons duplicate the resolve logic from `handleSend`'s ask_user branch. This is intentional — they're a shortcut that bypasses the input field.

**Step 2: Build and verify no type errors**

Run: `npm run build`

**Step 3: Commit**

```
git add -A && git commit -m "feat: show yes/no quick-reply buttons for ask_user questions"
```
