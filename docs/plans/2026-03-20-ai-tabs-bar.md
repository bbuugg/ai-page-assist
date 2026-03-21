# AI Tabs Bar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show AI-opened tabs in a bar above the input box, with per-tab close and close-all buttons.

**Architecture:** background.ts tracks AI-opened tab IDs per session in `sessionAiTabs` map; pushes `AI_TABS_UPDATE` messages to overlay whenever the list changes. App.tsx listens and maintains `aiTabs` state. A new `AiTabsBar` component renders above the ChatPanel input.

**Tech Stack:** React 18, TypeScript, Chrome Extension MV3, Tailwind / inline styles matching existing glass style.

---

### Task 1: background.ts — track AI-opened tabs and push updates

**Files:**
- Modify: `src/background/background.ts`

**Step 1: Add sessionAiTabs map and helper**

After the existing `sessionTabGroups` declaration add:

```ts
// Tab IDs opened by the AI per session
const sessionAiTabs = new Map<string, number[]>();

function pushAiTabsUpdate(sessionId: string) {
  const ids = sessionAiTabs.get(sessionId) ?? [];
  if (ids.length === 0) {
    chrome.runtime.sendMessage({ type: 'AI_TABS_UPDATE', tabs: [] }).catch(() => {});
    return;
  }
  Promise.all(
    ids.map((id) =>
      new Promise<{ id: number; title: string; url: string }>((resolve) => {
        chrome.tabs.get(id, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            resolve({ id, title: String(id), url: '' });
          } else {
            resolve({ id, title: tab.title ?? String(id), url: tab.url ?? '' });
          }
        });
      })
    )
  ).then((tabs) => {
    chrome.runtime.sendMessage({ type: 'AI_TABS_UPDATE', tabs }).catch(() => {});
  });
}
```

**Step 2: Record tab on open_tab success**

In the `case 'open_tab':` block, after `inspectedTabId = tab.id` (line ~291), before `sendResponse`:

```ts
if (activeSessionId && tab.id !== undefined) {
  const existing = sessionAiTabs.get(activeSessionId) ?? [];
  sessionAiTabs.set(activeSessionId, [...existing, tab.id]);
  pushAiTabsUpdate(activeSessionId);
}
```

**Step 3: Remove tab on close_tab**

In `case 'close_tab':`, after `chrome.tabs.remove(closeId)`, before `sendResponse`:

```ts
if (activeSessionId) {
  const existing = sessionAiTabs.get(activeSessionId) ?? [];
  sessionAiTabs.set(activeSessionId, existing.filter((id) => id !== closeId));
  pushAiTabsUpdate(activeSessionId);
}
```

**Step 4: Remove tab on user-closed (onRemoved)**

Add a new listener after the `onUpdated` listener:

```ts
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [sessionId, ids] of sessionAiTabs) {
    if (ids.includes(tabId)) {
      sessionAiTabs.set(sessionId, ids.filter((id) => id !== tabId));
      if (sessionId === activeSessionId) pushAiTabsUpdate(sessionId);
      break;
    }
  }
});
```

**Step 5: Clear tabs on resetTabGroup**

In the `resetTabGroup` handler, after `sessionTabGroups.delete(activeSessionId)`:

```ts
if (activeSessionId) sessionAiTabs.delete(activeSessionId);
pushAiTabsUpdate(''); // push empty
```

Note: since activeSessionId is being cleared, just push empty directly:
```ts
chrome.runtime.sendMessage({ type: 'AI_TABS_UPDATE', tabs: [] }).catch(() => {});
```

**Step 6: Build and verify**

```bash
npm run build
```
Expected: exit 0, no TS errors.

**Step 7: Commit**

```bash
git add src/background/background.ts
git commit -m "feat: track AI-opened tabs in background and push AI_TABS_UPDATE"
```

---

### Task 2: App.tsx — receive AI_TABS_UPDATE and pass aiTabs to ChatPanel

**Files:**
- Modify: `src/overlay/App.tsx`

**Step 1: Add aiTabs state**

After the existing `useState` declarations, add:

```ts
const [aiTabs, setAiTabs] = useState<{ id: number; title: string; url: string }[]>([]);
```

**Step 2: Listen for AI_TABS_UPDATE in onMessage handler**

In the `onMessage` function inside the `useEffect` (around line 198), add a new branch:

```ts
} else if (type === 'AI_TABS_UPDATE') {
  setAiTabs((msg.tabs as { id: number; title: string; url: string }[]) ?? []);
}
```

**Step 3: Clear aiTabs on new/switch session**

In `handleNewSession` and `handleSwitchSession`, add:

```ts
setAiTabs([]);
```

**Step 4: Pass aiTabs + onCloseAiTab + onCloseAllAiTabs to ChatPanel**

Add handler functions before the return:

```ts
function handleCloseAiTab(tabId: number) {
  chrome.tabs.remove(tabId);
  // Optimistic update — background will also push AI_TABS_UPDATE
  setAiTabs((prev) => prev.filter((t) => t.id !== tabId));
}

function handleCloseAllAiTabs() {
  aiTabs.forEach((t) => chrome.tabs.remove(t.id));
  setAiTabs([]);
}
```

Pass to `<ChatPanel>` (find the ChatPanel JSX and add props):

```tsx
<ChatPanel
  ...
  aiTabs={aiTabs}
  onCloseAiTab={handleCloseAiTab}
  onCloseAllAiTabs={handleCloseAllAiTabs}
/>
```

**Step 5: Build and verify**

```bash
npm run build
```
Expected: exit 0 (may have TS error on ChatPanel props — that's fine, will fix in Task 3).

**Step 6: Commit**

```bash
git add src/overlay/App.tsx
git commit -m "feat: receive AI_TABS_UPDATE in App.tsx and wire close handlers"
```

---

### Task 3: ChatPanel.tsx — accept aiTabs props and render AiTabsBar

**Files:**
- Modify: `src/overlay/components/ChatPanel.tsx`

**Step 1: Add props to ChatPanel interface**

Find the `ChatPanelProps` interface (or prop destructuring) and add:

```ts
aiTabs: { id: number; title: string; url: string }[];
onCloseAiTab: (tabId: number) => void;
onCloseAllAiTabs: () => void;
```

**Step 2: Destructure new props**

In the function signature, add:

```ts
{ ..., aiTabs, onCloseAiTab, onCloseAllAiTabs }
```

**Step 3: Add AiTabsBar inline component above the textarea**

Find the input area JSX (the div containing the textarea and send button, near the bottom of the return). Just above it, add:

```tsx
{aiTabs.length > 0 && (
  <div style={{
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
    padding: '6px 12px',
    borderTop: '1px solid var(--glass-border)',
    background: 'var(--glass-bg)',
  }}>
    {aiTabs.map((tab) => (
      <div key={tab.id} style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '2px 6px 2px 8px',
        borderRadius: 12,
        background: 'var(--accent-glass)',
        border: '1px solid var(--glass-border)',
        maxWidth: 180,
        fontSize: 11,
        color: 'var(--text-primary)',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
          {tab.title || tab.url || `Tab ${tab.id}`}
        </span>
        <button
          onClick={() => onCloseAiTab(tab.id)}
          title="Close tab"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', lineHeight: 1, display: 'flex', alignItems: 'center' }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
          </svg>
        </button>
      </div>
    ))}
    <button
      onClick={onCloseAllAiTabs}
      title="Close all AI tabs"
      style={{
        marginLeft: 'auto',
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 10,
        border: '1px solid var(--glass-border)',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
      }}
    >
      Close all
    </button>
  </div>
)}
```

**Step 4: Build and verify**

```bash
npm run build
```
Expected: exit 0, no TS errors.

**Step 5: Commit**

```bash
git add src/overlay/components/ChatPanel.tsx
git commit -m "feat: render AI tabs bar above input in ChatPanel"
```
