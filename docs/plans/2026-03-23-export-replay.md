# Export / Replay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `/export [json|js]` and `/replay` slash commands so users can export AI tool-call sequences and replay them without AI involvement.

**Architecture:** Record every tool call (`name` + `input`) on the `ChatMessage` that represents the tool invocation. `/export` serialises those records from the active session; `/replay` picks a session (or imports a JSON file) and re-executes each step via `executeTool`, with pause/resume/stop controls.

**Tech Stack:** React 18, TypeScript, Chrome Extension MV3, existing `executeTool` from `src/lib/tools/index.ts`, existing slash-command pattern in `ChatPanel.tsx`.

---

## Task 1: Add `toolCall` field to `ChatMessage`

**Files:**
- Modify: `src/overlay/App.tsx`

**Step 1: Add field to interface**

In `App.tsx`, add to `ChatMessage`:
```ts
toolCall?: { name: string; input: Record<string, unknown> };
```

**Step 2: Wire recording in ChatPanel**

In `src/overlay/components/ChatPanel.tsx`, add prop:
```ts
onRecordToolCall: (name: string, input: Record<string, unknown>) => void;
```

In `handleSend`, inside the `onToolCall` callback, call it:
```ts
onToolCall: (toolName, input) => {
  streamBufRef.current = '';
  streamIdRef.current = null;
  setIsThinking(true);
  onAddMessage('system', `Using tool: ${toolName}…`, 'tool');
  onRecordToolCall(toolName, input);
},
```

**Step 3: Implement `onRecordToolCall` in App.tsx**

Add function:
```ts
function recordToolCall(name: string, input: Record<string, unknown>) {
  setActiveSession((prev) => {
    const messages = [...prev.messages];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].toolMeta === 'tool') {
        messages[i] = { ...messages[i], toolCall: { name, input } };
        break;
      }
    }
    return { ...prev, messages };
  });
}
```

Pass `onRecordToolCall={recordToolCall}` to `<ChatPanel>`.

**Step 4: Build and verify**
```bash
npm run build
```
Expected: exit 0.

---

## Task 2: `/export` command

**Files:**
- Modify: `src/overlay/components/ChatPanel.tsx`

**Step 1: Add export helper function**

Add near the top of ChatPanel component (after state declarations):
```ts
function exportSession(format: 'json' | 'js') {
  const steps = messages
    .filter((m) => m.toolMeta === 'tool' && m.toolCall && !m.toolIsError)
    .map((m) => m.toolCall!);
  if (steps.length === 0) {
    onAddMessage('system', '当前会话没有可导出的工具调用记录。');
    return;
  }
  const sessionTitle = messages.find((m) => m.role === 'user')?.text.slice(0, 32) ?? 'session';
  const safeName = sessionTitle.replace(/[^\w\u4e00-\u9fa5]/g, '-').slice(0, 32);
  let content: string;
  let filename: string;
  let mime: string;
  if (format === 'json') {
    content = JSON.stringify(steps, null, 2);
    filename = `replay-${safeName}.json`;
    mime = 'application/json';
  } else {
    const lines = [
      `// AI Page Inspector — Replay Script`,
      `// Generated: ${new Date().toISOString()}`,
      `// Steps: ${steps.length}`,
      ``,
      `const steps = ${JSON.stringify(steps, null, 2)};`,
      ``,
      `async function replay() {`,
      `  for (let i = 0; i < steps.length; i++) {`,
      `    const { name, input } = steps[i];`,
      `    console.log('[replay] step', i + 1, '/', steps.length, name, input);`,
      `    await new Promise((resolve) => {`,
      `      chrome.runtime.sendMessage(`,
      `        { action: 'toContent', action_inner: 'tool', tool: name, input },`,
      `        () => setTimeout(resolve, 300)`,
      `      );`,
      `    });`,
      `  }`,
      `  console.log('[replay] done');`,
      `}`,
      ``,
      `replay();`,
    ];
    content = lines.join('\n');
    filename = `replay-${safeName}.js`;
    mime = 'text/javascript';
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  onAddMessage('system', `已导出 ${steps.length} 个步骤到 ${filename}`);
}
```

**Step 2: Add to SLASH_COMMANDS**

```ts
const SLASH_COMMANDS = [
  { name: '/compress', description: '调用 AI 压缩当前对话上下文' },
  { name: '/clear', description: '清空对话上下文' },
  { name: '/export json', description: '导出工具调用记录为 JSON 文件' },
  { name: '/export js', description: '导出工具调用记录为可执行 JS 脚本' },
];
```

**Step 3: Handle in `handleSend`**

Add after the `/clear` handler:
```ts
if (text === '/export json') {
  setInput('');
  exportSession('json');
  return;
}
if (text === '/export js') {
  setInput('');
  exportSession('js');
  return;
}
```

**Step 4: Build and verify**
```bash
npm run build
```
Expected: exit 0.

---

## Task 3: Replay state and executor

**Files:**
- Modify: `src/overlay/components/ChatPanel.tsx`
- Modify: `src/overlay/App.tsx` (pass `sessions` prop to ChatPanel)

**Step 1: Add replay state to ChatPanel**

```ts
interface ReplayState {
  steps: { name: string; input: Record<string, unknown> }[];
  index: number;
  paused: boolean;
  total: number;
}
const [replayState, setReplayState] = useState<ReplayState | null>(null);
const replayPausedRef = useRef(false);
const replayAbortRef = useRef(false);
```

**Step 2: Add replay executor function**

```ts
async function runReplay(steps: { name: string; input: Record<string, unknown> }[]) {
  if (steps.length === 0) { onAddMessage('system', '没有可回放的步骤。'); return; }
  replayPausedRef.current = false;
  replayAbortRef.current = false;
  setReplayState({ steps, index: 0, paused: false, total: steps.length });
  onAddMessage('system', `开始回放，共 ${steps.length} 个步骤…`);
  for (let i = 0; i < steps.length; i++) {
    if (replayAbortRef.current) break;
    while (replayPausedRef.current) {
      await new Promise((r) => setTimeout(r, 200));
      if (replayAbortRef.current) break;
    }
    if (replayAbortRef.current) break;
    const { name, input } = steps[i];
    setReplayState((prev) => prev ? { ...prev, index: i } : null);
    onAddMessage('system', `[${i + 1}/${steps.length}] ${name}`, 'tool');
    try {
      const result = await executeTool(name, input);
      onPatchLastToolResult(result.content, result.isError);
    } catch (e) {
      onPatchLastToolResult(String(e), true);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!replayAbortRef.current) onAddMessage('system', '回放完成。');
  setReplayState(null);
}
```

**Step 3: Import `executeTool`**

At the top of ChatPanel.tsx:
```ts
import { executeTool } from '../../lib/tools';
```

**Step 4: Build and verify**
```bash
npm run build
```
Expected: exit 0.

---

## Task 4: `/replay` command — session picker + file import UI

**Files:**
- Modify: `src/overlay/components/ChatPanel.tsx`
- Modify: `src/overlay/App.tsx` (pass `sessions` prop)

**Step 1: Add `sessions` prop to ChatPanel**

In Props interface:
```ts
sessions: Session[];
```

In App.tsx, pass:
```tsx
<ChatPanel sessions={sessions} ... />
```

Add import in ChatPanel.tsx:
```ts
import type { Session } from '../../lib/storage';
```

**Step 2: Add replay picker state**

```ts
const [showReplayPicker, setShowReplayPicker] = useState(false);
const replayPickerRef = useRef<HTMLDivElement>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
```

**Step 3: Add `/replay` to SLASH_COMMANDS and handler**

```ts
{ name: '/replay', description: '回放历史会话或导入 JSON 文件的工具操作' },
```

In handleSend:
```ts
if (text === '/replay') {
  setInput('');
  setShowReplayPicker(true);
  return;
}
```

**Step 4: Add replay picker UI**

Add after the slash dropdown, before the textarea border div:
```tsx
{showReplayPicker && (
  <div ref={replayPickerRef} style={{
    position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 50,
    background: 'var(--glass-bg)', backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--glass-border)', borderRadius: 12,
    padding: 4, marginBottom: 4, boxShadow: 'var(--glass-shadow)',
    maxHeight: 260, overflowY: 'auto',
  }}>
    <div style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>选择要回放的会话</div>
    {sessions
      .filter((s) => s.messages.some((m) => m.toolCall))
      .map((s) => (
        <button key={s.id} onMouseDown={(e) => {
          e.preventDefault();
          const steps = s.messages.filter((m) => m.toolCall && !m.toolIsError).map((m) => m.toolCall!);
          setShowReplayPicker(false);
          void runReplay(steps);
        }} style={{
          width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          padding: '6px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
          background: 'transparent', fontSize: 12, border: '1px solid transparent', outline: 'none',
          color: 'var(--text-primary)',
        }}>
          <span style={{ fontWeight: 600 }}>{s.title || '无标题会话'}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {s.messages.filter((m) => m.toolCall && !m.toolIsError).length} 个步骤
          </span>
        </button>
      ))}
    {sessions.filter((s) => s.messages.some((m) => m.toolCall)).length === 0 && (
      <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>暂无包含工具调用的历史会话</div>
    )}
    <div style={{ borderTop: '1px solid var(--glass-border)', margin: '4px 0' }} />
    <button onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
      background: 'transparent', fontSize: 12, border: '1px solid transparent', outline: 'none',
      color: 'var(--text-primary)',
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      导入 JSON 文件
    </button>
    <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const steps = JSON.parse(ev.target?.result as string);
          if (!Array.isArray(steps)) throw new Error('Invalid format');
          setShowReplayPicker(false);
          void runReplay(steps);
        } catch {
          onAddMessage('system', '导入失败：文件格式无效，需要 JSON 数组格式。');
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    }} />
  </div>
)}
```

**Step 5: Close picker on outside click**

Add to the existing `handleClickOutside` useEffect in ChatPanel (or add a new one):
```ts
useEffect(() => {
  function handleOutside(e: MouseEvent) {
    if (replayPickerRef.current && !replayPickerRef.current.contains(e.target as Node)) {
      setShowReplayPicker(false);
    }
  }
  if (showReplayPicker) document.addEventListener('mousedown', handleOutside);
  return () => document.removeEventListener('mousedown', handleOutside);
}, [showReplayPicker]);
```

**Step 6: Build and verify**
```bash
npm run build
```
Expected: exit 0.

---

## Task 5: Replay status bar UI (pause/resume/stop)

**Files:**
- Modify: `src/overlay/components/ChatPanel.tsx`

**Step 1: Add status bar above the input box**

Above the `<div className="border border-border rounded-2xl ...">`:
```tsx
{replayState && (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
    borderRadius: 10, border: '1px solid var(--glass-border)',
    background:    'var(--glass-bg)', fontSize: 11,
  }}>
    <span style={{ flex: 1, color: 'var(--text-muted)' }}>
      回放中 {replayState.index + 1} / {replayState.total}
    </span>
    <Button size="sm" variant="outline" className="h-5 text-[10px] px-2"
      onClick={() => { replayPausedRef.current = !replayPausedRef.current; setReplayState((p) => p ? { ...p, paused: !p.paused } : null); }}>
      {replayState.paused ? '继续' : '暂停'}
    </Button>
    <Button size="sm" variant="destructive" className="h-5 text-[10px] px-2"
      onClick={() => { replayAbortRef.current = true; replayPausedRef.current = false; setReplayState(null); onAddMessage('system', '回放已停止。'); }}>
      停止
    </Button>
  </div>
)}
```

**Step 2: Build and verify**
```bash
npm run build
```
Expected: exit 0.

---

## Task 6: Final integration check

**Step 1: Build**
```bash
npm run build
```
Expected: exit 0, no type errors.

**Step 2: Manual test checklist**
- Start a session, have AI call tools (e.g. `click_element`, `fill_input`)
- Type `/export json` → JSON file downloaded with correct steps array
- Type `/export js` → JS file downloaded with runnable script
- Type `/replay` → picker shows current session in list with step count
- Select session → replay executes each step, status bar shows progress
- Click pause → execution stops between steps
- Click resume → execution continues
- Click stop → execution aborts, "回放已停止" message shown
- Import JSON file via picker → replay executes correctly
