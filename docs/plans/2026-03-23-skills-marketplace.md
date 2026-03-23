# Skills Marketplace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an Agent Skills Marketplace where users browse built-in Skills and create custom ones; Skills are activated via @mention in the chat input, persist until cancelled, and inject a system prompt supplement + tool hints into each AI turn.

**Architecture:** Skills defined in `src/lib/skills.ts` (built-ins hardcoded, custom stored in chrome.storage.local). `activeSkillId` lives in per-session Zustand state. ChatPanel detects `@` input to show a picker popover, shows an active skill chip in the input area, and passes `extraSystemPrompt` to `runConversationTurn`. A Marketplace panel is accessible from a new toolbar button in the input row.

**Tech Stack:** React 18, TypeScript, Zustand (existing store), chrome.storage.local, inline styles + CSS variables matching existing glass design.

---

### Task 1: Define Skill type, built-ins, and storage helpers

**Files:**
- Create: `src/lib/skills.ts`

**Step 1: Create the file**

```ts
// src/lib/skills.ts

export interface Skill {
  id: string;
  name: string;          // @mention trigger (lowercase, no spaces)
  label: string;         // display name
  description: string;
  icon: string;          // emoji
  systemPrompt: string;
  recommendedTools: string[];
  isBuiltin: boolean;
}

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'builtin-seo',
    name: 'seo',
    label: 'SEO Analyst',
    description: 'Analyze page SEO: meta tags, headings, keywords, links.',
    icon: '🔍',
    systemPrompt: 'You are an expert SEO analyst. Focus on meta tags, heading hierarchy, keyword usage, internal/external links, and page performance. Provide actionable recommendations.',
    recommendedTools: ['get_full_page_html', 'query_page', 'extract_page_elements', 'get_page_context'],
    isBuiltin: true,
  },
  {
    id: 'builtin-code',
    name: 'code',
    label: 'Code Reviewer',
    description: 'Review and explain code on the current page.',
    icon: '💻',
    systemPrompt: 'You are an expert code reviewer. Focus on correctness, security, performance, and best practices. Explain complex code clearly and suggest improvements.',
    recommendedTools: ['get_full_page_html', 'query_page', 'extract_page_elements'],
    isBuiltin: true,
  },
  {
    id: 'builtin-form',
    name: 'form',
    label: 'Form Automator',
    description: 'Intelligently fill and submit forms.',
    icon: '📝',
    systemPrompt: 'You are an expert at web form automation. Identify all form fields, understand their purpose, and fill them accurately. Always verify values after filling.',
    recommendedTools: ['extract_page_elements', 'fill_input', 'click_element', 'select_option', 'query_page'],
    isBuiltin: true,
  },
  {
    id: 'builtin-data',
    name: 'data',
    label: 'Data Extractor',
    description: 'Extract structured data from the page.',
    icon: '📊',
    systemPrompt: 'You are a data extraction specialist. Identify and extract structured data (tables, lists, prices, contacts). Present data in clean, structured formats.',
    recommendedTools: ['extract_page_elements', 'query_page', 'get_full_page_html', 'execute_js'],
    isBuiltin: true,
  },
  {
    id: 'builtin-a11y',
    name: 'a11y',
    label: 'Accessibility Checker',
    description: 'Check the page for WCAG accessibility issues.',
    icon: '♿',
    systemPrompt: 'You are an accessibility expert following WCAG 2.1. Analyze for missing alt text, poor contrast, keyboard navigation issues, missing ARIA attributes, and form label problems. Provide specific fixes.',
    recommendedTools: ['get_full_page_html', 'query_page', 'extract_page_elements', 'execute_js'],
    isBuiltin: true,
  },
  {
    id: 'builtin-shop',
    name: 'shop',
    label: 'Shopping Assistant',
    description: 'Compare products, find deals, assist with purchases.',
    icon: '🛍️',
    systemPrompt: 'You are a savvy shopping assistant. Help find deals, compare specs and prices, check reviews, and navigate e-commerce sites. Look for discount codes or alternatives.',
    recommendedTools: ['get_page_context', 'extract_page_elements', 'query_page', 'open_tab', 'fetch_url'],
    isBuiltin: true,
  },
];

export async function loadCustomSkills(): Promise<Skill[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customSkills'], (result) => {
      resolve(result.customSkills ?? []);
    });
  });
}

export async function saveCustomSkills(skills: Skill[]): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ customSkills: skills }, resolve));
}

export function getAllSkills(customSkills: Skill[]): Skill[] {
  return [...BUILTIN_SKILLS, ...customSkills];
}

export function buildSkillSystemPrompt(skill: Skill): string {
  const toolsHint = skill.recommendedTools.length > 0
    ? `\nPreferred tools for this skill: ${skill.recommendedTools.join(', ')}.`
    : '';
  return `\n\n---\nActive Skill: ${skill.label}\n${skill.systemPrompt}${toolsHint}`;
}
```

**Step 2: Build**

```bash
cd /Users/chengyao/Workspace/chrome/ai-page-inspector && npm run build
```
Expected: exit 0.

**Step 3: Commit**

```bash
git add src/lib/skills.ts
git commit -m "feat: add Skill type, built-in skills, and storage helpers"
```

---

### Task 2: Add customSkills + activeSkillId to Zustand store

**Files:**
- Modify: `src/overlay/store.ts`

**Step 1: Read `src/overlay/store.ts` fully before editing**

**Step 2: Add `activeSkillId` to `ChatSessionState`**

In the `ChatSessionState` interface, add:
```ts
activeSkillId: string | null;
```

In `defaultSessionState()`, add:
```ts
activeSkillId: null,
```

**Step 3: Add `customSkills` to shared store state**

In the `ChatStore` interface, add:
```ts
customSkills: Skill[];
setActiveSkillId: (id: string, skillId: string | null) => void;
setCustomSkills: (skills: Skill[]) => void;
```

In the store implementation, add:
```ts
customSkills: [],

setActiveSkillId: (id, activeSkillId) =>
  set((s) => ({ sessions: { ...s.sessions, [id]: { ...(s.sessions[id] ?? defaultSessionState()), activeSkillId } } })),

setCustomSkills: (customSkills) => {
  set({ customSkills });
  saveCustomSkills(customSkills);
},
```

**Step 4: Load customSkills in `loadSharedSettings`**

In `loadSharedSettings`, add `loadCustomSkills()` to the `Promise.all`:
```ts
loadSharedSettings: async () => {
  const [servers, tools, customSkills] = await Promise.all([
    loadMcpServers(), loadDisabledTools(), loadCustomSkills()
  ]);
  set({ mcpServers: servers, disabledTools: tools, customSkills, settingsLoaded: true });
},
```

Also add the import at the top:
```ts
import { loadCustomSkills, saveCustomSkills, type Skill } from '../lib/skills';
```

**Step 5: Build**

```bash
npm run build
```
Expected: exit 0.

**Step 6: Commit**

```bash
git add src/overlay/store.ts
git commit -m "feat: add activeSkillId and customSkills to Zustand store"
```

---

### Task 3: Add extraSystemPrompt to runConversationTurn and AI runners

**Files:**
- Modify: `src/lib/ai/index.ts`
- Modify: `src/lib/ai/anthropic.ts`
- Modify: `src/lib/ai/openai.ts`

**Step 1: Read `src/lib/ai/openai.ts` to see its signature (mirror of anthropic.ts)**

**Step 2: Add `extraSystemPrompt?: string` to `runConversationTurn`**

In `src/lib/ai/index.ts`, change the signature:
```ts
export async function runConversationTurn(
  history: MessageParam[],
  settings: Settings,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  extraSystemPrompt?: string,
): Promise<MessageParam[]> {
```

Pass it through:
```ts
if (settings.provider === 'anthropic') {
  return runAnthropicTurn(dedupedHistory, settings, callbacks, signal, disabledTools, mcpTools, extraSystemPrompt);
}
return runOpenAITurn(dedupedHistory, settings, callbacks, signal, disabledTools, mcpTools, extraSystemPrompt);
```

**Step 3: Add `extraSystemPrompt` to `runAnthropicTurn`**

In `src/lib/ai/anthropic.ts`, add param:
```ts
export async function runAnthropicTurn(
  ...
  mcpTools: McpTool[] = [],
  extraSystemPrompt = '',
): Promise<MessageParam[]> {
```

Change the system line:
```ts
system: SYSTEM_PROMPT + extraSystemPrompt,
```

**Step 4: Mirror the same change in `runOpenAITurn` in `src/lib/ai/openai.ts`**

Read the file first. Find where `SYSTEM_PROMPT` is used and append `extraSystemPrompt` the same way.

**Step 5: Build**

```bash
npm run build
```
Expected: exit 0.

**Step 6: Commit**

```bash
git add src/lib/ai/index.ts src/lib/ai/anthropic.ts src/lib/ai/openai.ts
git commit -m "feat: pass extraSystemPrompt through to AI runners"
```

---

### Task 4: @mention picker + active skill chip in ChatPanel

**Files:**
- Modify: `src/overlay/components/ChatPanel.tsx`

**Context:** The input area is a `<textarea>` inside a rounded div. The bottom row has model selector + MCP button + send button. The input container div at line ~564 has `className="px-3 pb-3.5 pt-2"` and the inner rounded div wraps the textarea and bottom row.

**Step 1: Add imports at top of ChatPanel.tsx**

```ts
import { getAllSkills, buildSkillSystemPrompt, type Skill } from '../../lib/skills';
```

**Step 2: Add mention state in the ChatPanel function body**

After existing state declarations:
```ts
const [mentionQuery, setMentionQuery] = useState<string | null>(null);
const [mentionIndex, setMentionIndex] = useState(0);
const customSkills = useChatStore((s) => s.customSkills);
const activeSkillId = store.getSession(sessionId).activeSkillId;
const allSkills = getAllSkills(customSkills);
const activeSkill = allSkills.find((s) => s.id === activeSkillId) ?? null;
const mentionSkills = mentionQuery !== null
  ? allSkills.filter((s) => s.name.includes(mentionQuery) || s.label.toLowerCase().includes(mentionQuery))
  : [];
```

**Step 3: Add selectMention function**

```ts
function selectMention(skill: Skill) {
  const atIdx = input.lastIndexOf('@');
  setInput(atIdx >= 0 ? input.slice(0, atIdx) : input);
  setMentionQuery(null);
  store.setActiveSkillId(sessionId, skill.id);
}
```

**Step 4: Update textarea onChange to detect @**

Replace the current `onChange={(e) => setInput(e.target.value)}` with:
```tsx
onChange={(e) => {
  const val = e.target.value;
  setInput(val);
  const atIdx = val.lastIndexOf('@');
  if (atIdx !== -1 && (atIdx === 0 || /[\s\n]/.test(val[atIdx - 1]))) {
    const query = val.slice(atIdx + 1).toLowerCase();
    if (!query.includes(' ') && !query.includes('\n')) {
      setMentionQuery(query);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  } else {
    setMentionQuery(null);
  }
}}
```

**Step 5: Update handleKeyDown to handle mention navigation**

In `handleKeyDown`, before the existing `Enter` check, add:
```ts
if (mentionQuery !== null && mentionSkills.length > 0) {
  if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionSkills.length - 1)); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(mentionSkills[mentionIndex]); return; }
  if (e.key === 'Escape') { setMentionQuery(null); return; }
}
```

**Step 6: Wire extraSystemPrompt into handleSend**

In `handleSend`, find the `runConversationTurn(...)` call and add `extraSystemPrompt` as the 5th argument:
```ts
const extraSystemPrompt = activeSkill ? buildSkillSystemPrompt(activeSkill) : undefined;
const finalHistory = await runConversationTurn(
  newHistory,
  settings,
  { ...callbacks },
  abort.signal,
  extraSystemPrompt,
);
```

**Step 7: Render active skill chip in input area**

Inside the rounded input div (just above the `<textarea>`), add:
```tsx
{activeSkill && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 2 }}>
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 6px 1px 6px', borderRadius: 8,
      background: 'var(--accent-glass)', border: '1px solid var(--glass-border)',
      fontSize: 11, color: 'var(--text-primary)',
    }}>
      <span>{activeSkill.icon}</span>
      <span style={{ fontWeight: 600 }}>{activeSkill.label}</span>
      <button
        onMouseDown={(e) => { e.preventDefault(); store.setActiveSkillId(sessionId, null); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', lineHeight: 1 }}
      >
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
        </svg>
      </button>
    </div>
  </div>
)}
```

**Step 8: Render @mention picker popover**

The input area container div (`className="px-3 pb-3.5 pt-2"`) needs `position: relative`. Add `style={{ position: 'relative' }}` to it. Then just before the inner rounded div, add:
```tsx
{mentionQuery !== null && mentionSkills.length > 0 && (
  <div style={{
    position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 50,
    background: 'var(--glass-bg)', backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--glass-border)', borderRadius: 12,
    padding: 4, marginBottom: 4, boxShadow: 'var(--glass-shadow)',
  }}>
    {mentionSkills.map((skill, i) => (
      <button
        key={skill.id}
        onMouseDown={(e) => { e.preventDefault(); selectMention(skill); }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
          background: i === mentionIndex ? 'var(--accent-glass)' : 'transparent',
          color: 'var(--text-primary)', fontSize: 12,
        }}
      >
        <span style={{ fontSize: 15 }}>{skill.icon}</span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>{skill.label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</span>
        </div>
      </button>
    ))}
  </div>
)}
```

**Step 9: Build**

```bash
npm run build
```
Expected: exit 0.

**Step 10: Commit**

```bash
git add src/overlay/components/ChatPanel.tsx
git commit -m "feat: @mention picker and active skill chip in ChatPanel"
```

---

### Task 5: Skills Marketplace panel

**Files:**
- Create: `src/overlay/components/SkillsPanel.tsx`
- Modify: `src/overlay/components/ChatPanel.tsx`

**Step 1: Create `src/overlay/components/SkillsPanel.tsx`**

The panel shows:
- Built-in skills grid (icon, label, description, "Use" button)
- Custom skills section with Add form (name, label, icon emoji, description, systemPrompt textarea, recommendedTools checkboxes)
- Each custom skill has a Delete button

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BUILTIN_SKILLS, getAllSkills, type Skill } from '../../lib/skills';
import { useChatStore } from '../store';
import { cn } from '@/lib/utils';
import { TOOL_DEFINITIONS } from '../../lib/tools';

const ALL_TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);

interface Props {
  sessionId: string;
  onClose: () => void;
}

export default function SkillsPanel({ sessionId, onClose }: Props) {
  const store = useChatStore();
  const customSkills = useChatStore((s) => s.customSkills);
  const activeSkillId = store.getSession(sessionId).activeSkillId;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', label: '', icon: '⚡', description: '', systemPrompt: '', recommendedTools: [] as string[] });
  const allSkills = getAllSkills(customSkills);

  function handleActivate(skill: Skill) {
    store.setActiveSkillId(sessionId, skill.id === activeSkillId ? null : skill.id);
    onClose();
  }

  function handleDelete(id: string) {
    store.setCustomSkills(customSkills.filter((s) => s.id !== id));
  }

  function handleSave() {
    if (!form.name.trim() || !form.label.trim() || !form.systemPrompt.trim()) return;
    const newSkill: Skill = {
      id: `custom-${Date.now()}`,
      name: form.name.toLowerCase().replace(/\s+/g, '-'),
      label: form.label,
      icon: form.icon || '⚡',
      description: form.description,
      systemPrompt: form.systemPrompt,
      recommendedTools: form.recommendedTools,
      isBuiltin: false,
    };
    store.setCustomSkills([...customSkills, newSkill]);
    setForm({ name: '', label: '', icon: '⚡', description: '', systemPrompt: '', recommendedTools: [] });
    setShowForm(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
    borderRadius: 8, padding: '5px 8px', fontSize: 12, color: 'var(--text-primary)',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40,
      background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)' }}>⚡ Skills</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allSkills.map((skill) => (
          <div key={skill.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
            borderRadius: 10, border: '1px solid var(--glass-border)',
            background: activeSkillId === skill.id ? 'var(--accent-glass)' : 'var(--glass-bg)',
          }}>
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{skill.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)' }}>{skill.label} <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>@{skill.name}</span></div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{skill.description}</div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <Button variant={activeSkillId === skill.id ? 'default' : 'outline'} size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => handleActivate(skill)}>
                {activeSkillId === skill.id ? 'Active' : 'Use'}
              </Button>
              {!skill.isBuiltin && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={() => handleDelete(skill.id)}>Del</Button>
              )}
            </div>
          </div>
        ))}

        {/* Add custom skill */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '7px 10px', borderRadius: 10, border: '1px dashed var(--glass-border)',
              background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add custom skill
          </button>
        ) : (
          <div style={{ border: '1px solid var(--glass-border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} style={{ ...inputStyle, width: 36, textAlign: 'center' }} placeholder="⚡" />
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} style={inputStyle} placeholder="Display name *" />
            </div>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="@mention trigger (e.g. myskill) *" />
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={inputStyle} placeholder="Short description" />
            <textarea value={form.systemPrompt} onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))} style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} placeholder="System prompt supplement *" />
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recommended tools:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {ALL_TOOL_NAMES.map((t) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={form.recommendedTools.includes(t)}
                    onChange={(e) => setForm((f) => ({ ...f, recommendedTools: e.target.checked ? [...f.recommendedTools, t] : f.recommendedTools.filter((x) => x !== t) }))}
                    style={{ width: 10, height: 10 }} />
                  {t}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSave}>Save</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Add Skills panel state and button to ChatPanel**

In `ChatPanel`, add state:
```ts
const [showSkillsPanel, setShowSkillsPanel] = useState(false);
```

Import SkillsPanel:
```ts
import SkillsPanel from './SkillsPanel';
```

In the return JSX, wrap the whole chat panel in `<div style={{ position: 'relative', ... }}>` (it already is — just ensure the outermost div has `position: relative`). Then conditionally render SkillsPanel overlaying it:
```tsx
{showSkillsPanel && <SkillsPanel sessionId={sessionId} onClose={() => setShowSkillsPanel(false)} />}
```

Add a Skills button in the bottom row (next to MCP button):
```tsx
<Button
  variant={showSkillsPanel ? 'secondary' : 'outline'}
  size="sm"
  onClick={() => setShowSkillsPanel((v) => !v)}
  title="Skills"
  className={cn('h-6 text-[10px] font-semibold gap-1 px-2', activeSkill && 'text-primary')}
>
  ⚡
  {activeSkill && <span style={{ maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeSkill.label}</span>}
</Button>
```

**Step 3: Build**

```bash
npm run build
```
Expected: exit 0.

**Step 4: Commit**

```bash
git add src/overlay/components/SkillsPanel.tsx src/overlay/components/ChatPanel.tsx
git commit -m "feat: Skills Marketplace panel with built-in and custom skills"
```
