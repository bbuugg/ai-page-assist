# Skill → Agent Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename every "Skill" concept to "Agent" across all code symbols, file/directory names, storage keys, and UI text.

**Architecture:** Rename `src/lib/skills/` → `src/lib/agents/`, rename all exported symbols (`Skill`→`Agent`, `skillXxx`→`agentXxx`, etc.), update all import paths, update storage keys, update UI text. Build validates at the end of each task.

**Tech Stack:** TypeScript, React 18, Zustand, Chrome Extension MV3, Vite

---

### Task 1: Rename directory and builtin agent files

**Files:**
- Rename dir: `src/lib/skills/` → `src/lib/agents/`
- Rename: all `src/lib/agents/builtin/*.ts` (no content changes yet, just the move)

**Step 1: Rename the directory**

```bash
mv src/lib/skills src/lib/agents
```

**Step 2: Verify files exist**

```bash
ls src/lib/agents/builtin/
```
Expected: `a11y.ts  apidoc.ts  browser.ts  code.ts  data.ts  form.ts  seo.ts  shopping.ts`

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: rename skills/ directory to agents/"
```

---

### Task 2: Update `src/lib/agents/index.ts` — rename all symbols

**Files:**
- Modify: `src/lib/agents/index.ts`

**Step 1: Replace file content**

Replace the entire file with:

```ts
export interface Agent {
  id: string;
  name: string;          // @mention trigger (lowercase, no spaces)
  label: string;         // display name
  description: string;
  icon: string;          // emoji
  systemPrompt: string;
  recommendedTools: string[];
  isBuiltin: boolean;
}

export { seoSkill as seoAgent } from './builtin/seo';
export { codeSkill as codeAgent } from './builtin/code';
export { formSkill as formAgent } from './builtin/form';
export { dataSkill as dataAgent } from './builtin/data';
export { a11ySkill as a11yAgent } from './builtin/a11y';
export { shoppingSkill as shoppingAgent } from './builtin/shopping';
export { browserSkill as browserAgent } from './builtin/browser';
export { apidocSkill as apidocAgent } from './builtin/apidoc';

import { seoSkill } from './builtin/seo';
import { codeSkill } from './builtin/code';
import { formSkill } from './builtin/form';
import { dataSkill } from './builtin/data';
import { a11ySkill } from './builtin/a11y';
import { shoppingSkill } from './builtin/shopping';
import { browserSkill } from './builtin/browser';
import { apidocSkill } from './builtin/apidoc';

export const BUILTIN_AGENTS: Agent[] = [
  seoSkill,
  codeSkill,
  formSkill,
  dataSkill,
  a11ySkill,
  shoppingSkill,
  browserSkill,
  apidocSkill,
];

export async function loadCustomAgents(): Promise<Agent[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customAgents'], (result) => {
      resolve(result.customAgents ?? []);
    });
  });
}

export async function saveCustomAgents(agents: Agent[]): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ customAgents: agents }, resolve));
}

export function getAllAgents(customAgents: Agent[]): Agent[] {
  return [...BUILTIN_AGENTS, ...customAgents];
}

export function buildAgentSystemPrompt(agent: Agent): string {
  const toolsHint = agent.recommendedTools.length > 0
    ? `\nPreferred tools for this agent: ${agent.recommendedTools.join(', ')}.`
    : '';
  return `\n\n---\nActive Agent: ${agent.label}\n${agent.systemPrompt}${toolsHint}`;
}
```

Note: builtin files still export `xxxSkill` — the re-exports alias them as `xxxAgent`. The builtin files themselves will be updated in Task 3.

**Step 2: Build to check**

```bash
npm run build 2>&1 | grep -E 'error|built in'
```
Expected: build will fail because importers still reference old paths — that's OK, continue.

**Step 3: Commit**

```bash
git add src/lib/agents/index.ts
git commit -m "refactor: rename Agent interface and symbols in agents/index.ts"
```

---

### Task 3: Update builtin agent files — rename exported variable names

**Files:**
- Modify: `src/lib/agents/builtin/seo.ts` — rename `seoSkill` → `seoAgent`, type `Skill` → `Agent`
- Same pattern for all 8 builtin files

**Step 1: Update each builtin file**

In every `src/lib/agents/builtin/*.ts` file:
- Change `import type { Skill }` → `import type { Agent }`
- Change `export const xxxSkill: Skill =` → `export const xxxAgent: Agent =`
  (also keep old name as alias if needed, but since index.ts already re-exports, just rename)

For example `seo.ts` becomes:
```ts
import type { Agent } from '../index';

export const seoAgent: Agent = {
  id: 'builtin-seo',
  // ... rest unchanged
};
```

Apply the same pattern to: `code.ts`, `form.ts`, `data.ts`, `a11y.ts`, `shopping.ts`, `browser.ts`, `apidoc.ts`.

**Step 2: Update `agents/index.ts` imports to use new names**

In `src/lib/agents/index.ts`, replace the import/re-export block:
```ts
export { seoAgent } from './builtin/seo';
// ... etc for all 8

import { seoAgent } from './builtin/seo';
// ... etc

export const BUILTIN_AGENTS: Agent[] = [
  seoAgent, codeAgent, formAgent, dataAgent,
  a11yAgent, shoppingAgent, browserAgent, apidocAgent,
];
```

**Step 3: Build check**

```bash
npm run build 2>&1 | grep -E 'error|built in'
```
Expected: still errors from other files not yet updated — OK.

**Step 4: Commit**

```bash
git add src/lib/agents/
git commit -m "refactor: rename builtin Skill exports to Agent"
```

---

### Task 4: Update `src/lib/storage.ts` — rename skill storage functions

**Files:**
- Modify: `src/lib/storage.ts`

**Step 1: Rename the two skill-disabled-tools functions**

Replace:
```ts
export async function loadSkillDisabledTools(): Promise<Record<string, string[]>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['skillDisabledTools'], (result) => {
      resolve(result.skillDisabledTools ?? {});
    });
  });
}

export async function saveSkillDisabledTools(map: Record<string, string[]>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ skillDisabledTools: map }, resolve));
}
```

With:
```ts
export async function loadAgentDisabledTools(): Promise<Record<string, string[]>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['agentDisabledTools'], (result) => {
      resolve(result.agentDisabledTools ?? {});
    });
  });
}

export async function saveAgentDisabledTools(map: Record<string, string[]>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ agentDisabledTools: map }, resolve));
}
```

**Step 2: Commit**

```bash
git add src/lib/storage.ts
git commit -m "refactor: rename skill storage functions to agent"
```

---

### Task 5: Update `src/overlay/store.ts` — rename all skill state/actions

**Files:**
- Modify: `src/overlay/store.ts`

**Step 1: Update imports**

Line 1 — change import from `../lib/storage`:
- `loadSkillDisabledTools` → `loadAgentDisabledTools`
- `saveSkillDisabledTools` → `saveAgentDisabledTools`

Line 2 — change import from `../lib/skills`:
- path: `'../lib/skills'` → `'../lib/agents'`
- `loadCustomSkills` → `loadCustomAgents`
- `saveCustomSkills` → `saveCustomAgents`
- `type Skill` → `type Agent`

**Step 2: Update store interface and state**

- `customSkills: Skill[]` → `customAgents: Agent[]`
- `skillDisabledTools: Record<string, string[]>` → `agentDisabledTools: Record<string, string[]>`
- `setCustomSkills(skills: Skill[])` → `setCustomAgents(agents: Agent[])`
- `setSkillDisabledTools(map)` → `setAgentDisabledTools(map)`
- `activeSkillId: string | null` → `activeAgentId: string | null`
- `setActiveSkillId(id, skillId)` → `setActiveAgentId(id, agentId)`

**Step 3: Update `loadSharedSettings`**

```ts
const [servers, tools, agentDisabledTools, customAgents, { providers, activeModelUid }, compressThreshold] = await Promise.all([
  loadMcpServers(), loadDisabledTools(), loadAgentDisabledTools(), loadCustomAgents(), loadProviders(), loadCompressThreshold(),
]);
set({ mcpServers: servers, disabledTools: tools, agentDisabledTools, customAgents, providers, activeModelUid, compressThreshold, settingsLoaded: true });
```

**Step 4: Update action implementations**

```ts
setCustomAgents: (agents) => {
  set({ customAgents: agents });
  saveCustomAgents(agents);
},
setAgentDisabledTools: (map) => {
  set({ agentDisabledTools: map });
  saveAgentDisabledTools(map);
},
setActiveAgentId: (id, agentId) => {
  set((state) => ({ sessions: { ...state.sessions, [id]: { ...state.sessions[id] ?? defaultSessionState(), activeAgentId: agentId } } }));
},
```

**Step 5: Commit**

```bash
git add src/overlay/store.ts
git commit -m "refactor: rename skill state/actions to agent in store"
```

---

### Task 6: Rename `SkillsPanel.tsx` → `AgentsPanel.tsx` and update its internals

**Files:**
- Rename: `src/overlay/components/SkillsPanel.tsx` → `src/overlay/components/AgentsPanel.tsx`
- Update all internals: `Skill`→`Agent`, import paths `../../lib/skills`→`../../lib/agents`, function/variable names, UI text

**Step 1: Rename file**

```bash
mv src/overlay/components/SkillsPanel.tsx src/overlay/components/AgentsPanel.tsx
```

**Step 2: Update imports in `AgentsPanel.tsx`**

```ts
import { getAllAgents, type Agent } from '../../lib/agents';
import { useChatStore } from '../store';
import { TOOL_META } from '../../lib/tools';
```

**Step 3: Update all internal references**

- `getAllSkills(customSkills)` → `getAllAgents(customAgents)`
- `useChatStore((s) => s.customSkills)` → `useChatStore((s) => s.customAgents)`
- `useChatStore((s) => s.skillDisabledTools)` → `useChatStore((s) => s.agentDisabledTools)`
- `store.setSkillDisabledTools(...)` → `store.setAgentDisabledTools(...)`
- `store.setCustomSkills(...)` → `store.setCustomAgents(...)`
- All `Skill` type annotations → `Agent`
- `EMPTY_FORM` stays as-is (it's a form shape, not a type)
- UI text: "技能"→"Agent", any labels mentioning "skill"
- Component export: `export default function SkillsPanel` → `export default function AgentsPanel`

**Step 4: Commit**

```bash
git add src/overlay/components/AgentsPanel.tsx
git rm src/overlay/components/SkillsPanel.tsx 2>/dev/null || true
git commit -m "refactor: rename SkillsPanel to AgentsPanel"
```

---

### Task 7: Update `ChatPanel.tsx` — rename all skill references

**Files:**
- Modify: `src/overlay/components/ChatPanel.tsx`

**Step 1: Update imports**

```ts
import { getAllAgents, buildAgentSystemPrompt, type Agent } from '../../lib/agents';
```

**Step 2: Update store reads**

- `store.getSession(sessionId).activeSkillId` → `sess.activeAgentId`
- `useChatStore((s) => s.customSkills)` → `useChatStore((s) => s.customAgents)`
- `store.setActiveSkillId(sessionId, ...)` → `store.setActiveAgentId(sessionId, ...)`

**Step 3: Update variable names and function calls**

- All `activeSkill` variables → `activeAgent`
- `getAllSkills(customSkills)` → `getAllAgents(customAgents)`
- `buildSkillSystemPrompt(activeSkill)` → `buildAgentSystemPrompt(activeAgent)`
- All `Skill` type annotations → `Agent`

**Step 4: Update UI text**

- `@skill` mention hint text → `@agent`
- Active chip label: if it says "技能" or "Skill" → "Agent"
- ⚡ button tooltip

**Step 5: Commit**

```bash
git add src/overlay/components/ChatPanel.tsx
git commit -m "refactor: rename skill references to agent in ChatPanel"
```

---

### Task 8: Update `SettingsPanel.tsx` — rename imports and references

**Files:**
- Modify: `src/overlay/components/SettingsPanel.tsx`

**Step 1: Update import**

```ts
import AgentsPanel from './AgentsPanel';
```

**Step 2: Rename state variable**

- `skillDialogTrigger` → `agentDialogTrigger`
- `setSkillDialogTrigger` → `setAgentDialogTrigger`

**Step 3: Update JSX**

```tsx
<AgentsPanel openDialogTrigger={agentDialogTrigger} onModalOpenChange={onModalOpenChange} />
```

Update the section heading text if it says "Skills" → "Agents".

**Step 4: Commit**

```bash
git add src/overlay/components/SettingsPanel.tsx
git commit -m "refactor: update SettingsPanel to use AgentsPanel"
```

---

### Task 9: Final build verification

**Step 1: Run build**

```bash
npm run build 2>&1 | grep -E 'error|Error|built in'
```
Expected: `✓ built in X.XXs`

**Step 2: Fix any remaining type errors**

If errors remain, search for any leftover