# Provider/Model Abstraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Provider layer so credentials (apiKey, baseURL) are configured once per provider and shared across multiple model entries under that provider.

**Architecture:** Introduce `ProviderConfig` (has credentials + array of `ModelEntry`) stored in `chrome.storage.local` under `providers` key. A `ResolvedModel` helper derives a flat view for the AI runner. The AI runners (`anthropic.ts`, `openai.ts`) replace `Settings` with `ResolvedModel`. SettingsPanel gets a two-level provider/model UI. App.tsx and ChatPanel use `activeModelUid` (a `providerId/modelEntryId` string) instead of `activeModelId`.

**Tech Stack:** TypeScript, React 18, Zustand, chrome.storage.local, existing Vite/Tailwind build.

---

### Task 1: Add ProviderConfig types and storage helpers

**Files:**
- Modify: `src/lib/storage.ts`

This task replaces the flat `ModelConfig` system with a nested `ProviderConfig` system. Keep the `Settings` interface and `loadSettings()` as a migration shim so nothing else breaks yet.

**Step 1: Add new types and helpers**

In `src/lib/storage.ts`, add after the existing `Provider` type (line 4):

```ts
export type ProviderType = 'anthropic' | 'openai' | 'ollama';

export interface ModelEntry {
  id: string;       // unique within provider
  label: string;    // display name, e.g. "Claude Sonnet"
  modelId: string;  // API string, e.g. "claude-sonnet-4-6"
}

export interface ProviderConfig {
  id: string;
  name: string;         // display name, e.g. "My Anthropic"
  type: ProviderType;
  apiKey: string;
  baseURL: string;
  models: ModelEntry[];
}

export interface ResolvedModel {
  uid: string;          // "<providerId>/<modelEntryId>"
  label: string;        // "ProviderName / ModelLabel"
  providerName: string;
  type: ProviderType;
  apiKey: string;
  baseURL: string;
  modelId: string;
}

export const PROVIDER_TYPE_DEFAULTS: Record<ProviderType, { baseURL: string; modelId: string; placeholder: string }> = {
  anthropic: { baseURL: 'https://api.anthropic.com',  modelId: 'claude-sonnet-4-6', placeholder: 'sk-ant-…' },
  openai:    { baseURL: 'https://api.openai.com/v1',   modelId: 'gpt-4o',             placeholder: 'sk-…' },
  ollama:    { baseURL: 'http://localhost:11434/v1',    modelId: 'llama3.2',           placeholder: '(no key needed)' },
};

export function resolveModel(providers: ProviderConfig[], uid: string): ResolvedModel | undefined {
  const [providerId, modelEntryId] = uid.split('/');
  const prov = providers.find((p) => p.id === providerId);
  if (!prov) return undefined;
  const entry = prov.models.find((m) => m.id === modelEntryId);
  if (!entry) return undefined;
  return {
    uid,
    label: `${prov.name} / ${entry.label}`,
    providerName: prov.name,
    type: prov.type,
    apiKey: prov.apiKey,
    baseURL: prov.baseURL,
    modelId: entry.modelId,
  };
}

export function getAllResolvedModels(providers: ProviderConfig[]): ResolvedModel[] {
  return providers.flatMap((prov) =>
    prov.models.map((entry) => ({
      uid: `${prov.id}/${entry.id}`,
      label: `${prov.name} / ${entry.label}`,
      providerName: prov.name,
      type: prov.type,
      apiKey: prov.apiKey,
      baseURL: prov.baseURL,
      modelId: entry.modelId,
    }))
  );
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'default-anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiKey: '',
    baseURL: 'https://api.anthropic.com',
    models: [{ id: 'default-m1', label: 'Claude Sonnet', modelId: 'claude-sonnet-4-6' }],
  },
];

export async function loadProviders(): Promise<{ providers: ProviderConfig[]; activeModelUid: string }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['providers', 'activeModelUid', 'models', 'activeModelId', 'provider', 'apiKey', 'baseURL', 'model'], (result) => {
      if (result.providers) {
        const providers: ProviderConfig[] = result.providers;
        const uid = result.activeModelUid ?? (providers[0]?.id && providers[0]?.models[0]?.id
          ? `${providers[0].id}/${providers[0].models[0].id}`
          : '');
        resolve({ providers, activeModelUid: uid });
        return;
      }
      // Migrate from old models[] format
      if (result.models && Array.isArray(result.models) && result.models.length > 0) {
        const oldModels: ModelConfig[] = result.models;
        const migrated: ProviderConfig[] = oldModels.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.provider,
          apiKey: m.apiKey,
          baseURL: m.baseURL,
          models: [{ id: 'main', label: m.name, modelId: m.model }],
        }));
        const activeOldId = result.activeModelId ?? oldModels[0]?.id;
        const activeProvForOld = migrated.find((p) => p.id === activeOldId) ?? migrated[0];
        const uid = activeProvForOld ? `${activeProvForOld.id}/main` : '';
        chrome.storage.local.set({ providers: migrated, activeModelUid: uid });
        resolve({ providers: migrated, activeModelUid: uid });
        return;
      }
      // Migrate from old flat Settings format
      if (result.apiKey) {
        const prov: ProviderConfig = {
          id: 'migrated-1',
          name: result.provider === 'openai' ? 'OpenAI' : result.provider === 'ollama' ? 'Ollama' : 'Anthropic',
          type: result.provider ?? 'anthropic',
          apiKey: result.apiKey ?? '',
          baseURL: result.baseURL ?? 'https://api.anthropic.com',
          models: [{ id: 'main', label: 'Default', modelId: result.model ?? 'claude-sonnet-4-6' }],
        };
        const providers = [prov];
        const uid = 'migrated-1/main';
        chrome.storage.local.set({ providers, activeModelUid: uid });
        resolve({ providers, activeModelUid: uid });
        return;
      }
      resolve({ providers: DEFAULT_PROVIDERS, activeModelUid: 'default-anthropic/default-m1' });
    });
  });
}

export async function saveProviders(providers: ProviderConfig[], activeModelUid: string): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ providers, activeModelUid }, resolve));
}
```

**Step 2: Build**

```bash
npm run build
```
Expected: exit 0.

**Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: add ProviderConfig types and storage helpers"
```

---

### Task 2: Update AI runners to accept ResolvedModel

**Files:**
- Modify: `src/lib/ai/anthropic.ts`
- Modify: `src/lib/ai/openai.ts`
- Modify: `src/lib/ai/index.ts`

Replace `Settings` with `ResolvedModel` in all three files. The `Settings` interface still exists in storage.ts as a shim — we just stop using it in the runners.

**Step 1: Update `src/lib/ai/anthropic.ts`**

Change the import at line 3 from:
```ts
import type { Settings } from '../storage';
```
to:
```ts
import type { ResolvedModel } from '../storage';
```

Change the function signature at line 11-18:
```ts
export async function runAnthropicTurn(
  history: MessageParam[],
  model: ResolvedModel,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  disabledTools: string[] = [],
  mcpTools: McpTool[] = [],
  extraSystemPrompt = '',
): Promise<MessageParam[]> {
  const client = new Anthropic({
    apiKey: model.apiKey,
    baseURL: model.baseURL || 'https://api.anthropic.com',
    dangerouslyAllowBrowser: true,
  });
```

Change line 41 (model string):
```ts
      model: model.modelId || 'claude-sonnet-4-6',
```

**Step 2: Update `src/lib/ai/openai.ts`**

Change the import at line 3 from:
```ts
import type { Settings } from '../storage';
```
to:
```ts
import type { ResolvedModel } from '../storage';
```

Change the function signature at line 119-127:
```ts
export async function runOpenAITurn(
  history: MessageParam[],
  model: ResolvedModel,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  disabledTools: string[] = [],
  mcpTools: McpTool[] = [],
  extraSystemPrompt = '',
): Promise<MessageParam[]> {
  const isOllama = model.type === 'ollama';
  const client = isOllama ? null : new OpenAI({
    apiKey: model.apiKey || 'openai',
    baseURL: model.baseURL,
    dangerouslyAllowBrowser: true,
  });
```

Change the `requestBody` model field (find `settings.model` in openai.ts) to `model.modelId`.

For the `streamViaBackground` call, find where `settings.baseURL` is used and replace with `model.baseURL`. Find `settings.model` and replace with `model.modelId`.

**Step 3: Update `src/lib/ai/index.ts`**

Change import:
```ts
import { loadDisabledTools, loadMcpServers, loadProviders, resolveModel, type ResolvedModel } from '../storage';
```

Change function signature:
```ts
export async function runConversationTurn(
  history: MessageParam[],
  model: ResolvedModel,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  extraSystemPrompt?: string,
): Promise<MessageParam[]> {
```

Remove the old `settings` parameter usage. Update the calls:
```ts
  if (model.type === 'anthropic') {
    return runAnthropicTurn(dedupedHistory, model, callbacks, signal, disabledTools, mcpTools, extraSystemPrompt);
  }
  return runOpenAITurn(dedupedHistory, model, callbacks, signal, disabledTools, mcpTools, extraSystemPrompt);
```

**Step 4: Build**

```bash
npm run build
```
Expected: build errors in App.tsx and ChatPanel.tsx because they still pass `Settings` — that's expected. Fix them in Task 3.

If there are errors only in `anthropic.ts`, `openai.ts`, `index.ts` — fix those now. If errors are only in consumers (App, ChatPanel), proceed.

**Step 5: Commit**

```bash
git add src/lib/ai/anthropic.ts src/lib/ai/openai.ts src/lib/ai/index.ts
git commit -m "feat: AI runners accept ResolvedModel instead of Settings"
```

---

### Task 3: Update Zustand store to use providers

**Files:**
- Modify: `src/overlay/store.ts`

**Step 1: Replace ModelConfig state with ProviderConfig state**

In `src/overlay/store.ts`, change imports to add `ProviderConfig`, `loadProviders`, `saveProviders`, `resolveModel`:
```ts
import { loadMcpServers, saveMcpServers, loadDisabledTools, saveDisabledTools, loadProviders, saveProviders, type McpServerConfig, type ProviderConfig } from '../lib/storage';
```

In the `ChatStore` interface, replace any `models`/`activeModelId` fields (if present) with:
```ts
  providers: ProviderConfig[];
  activeModelUid: string;
  setProviders: (providers: ProviderConfig[]) => void;
  setActiveModelUid: (uid: string) => void;
```

In the store implementation, add:
```ts
  providers: [],
  activeModelUid: '',

  setProviders: (providers) => {
    set({ providers });
    const state = get();
    saveProviders(providers, state.activeModelUid);
  },

  setActiveModelUid: (activeModelUid) => {
    set({ activeModelUid });
    const state = get();
    saveProviders(state.providers, activeModelUid);
  },
```

Update `loadSharedSettings` to load providers:
```ts
  loadSharedSettings: async () => {
    const [servers, tools, customSkills, { providers, activeModelUid }] = await Promise.all([
      loadMcpServers(), loadDisabledTools(), loadCustomSkills(), loadProviders(),
    ]);
    set({ mcpServers: servers, disabledTools: tools, customSkills, providers, activeModelUid, settingsLoaded: true });
  },
```

**Step 2: Build**

```bash
npm run build
```
Expected: errors in App.tsx and ChatPanel.tsx — fix in Task 4.

**Step 3: Commit**

```bash
git add src/overlay/store.ts
git commit -m "feat: Zustand store tracks providers and activeModelUid"
```

---

### Task 4: Update App.tsx and ChatPanel.tsx

**Files:**
- Modify: `src/overlay/App.tsx`
- Modify: `src/overlay/components/ChatPanel.tsx`

**Step 1: Update App.tsx**

Replace imports in App.tsx:
```ts
import { loadSessions, saveSession, deleteSession, newSession, loadProviders, saveProviders } from '../lib/storage';
import type { Session, ProviderConfig } from '../lib/storage';
```

Replace state:
```ts
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeModelUid, setActiveModelUid] = useState<string>('');
```

In the init `useEffect` (line ~104), replace `loadModels()` call:
```ts
  Promise.all([loadSessions(), loadProviders()]).then(([loaded, { providers: ps, activeModelUid: uid }]) => {
    setProviders(ps);
    setActiveModelUid(uid);
    // ... rest unchanged
  });
```

Find `handleActiveModelIdChange` (or where `saveModels` is called) and replace with:
```ts
  function handleActiveModelUidChange(uid: string) {
    setActiveModelUid(uid);
    saveProviders(providers, uid);
  }
```

Pass new props to `ChatPanel`:
```tsx
<ChatPanel
  ...
  providers={providers}
  activeModelUid={activeModelUid}
  onActiveModelUidChange={handleActiveModelUidChange}
  // remove: models, activeModelId,/>
```

Also pass `providers` to `SettingsPanel`:
```tsx
<SettingsPanel
  ...
  providers={providers}
  onProvidersChange={(ps, uid) => { setProviders(ps); if (uid) setActiveModelUid(uid); }}
/>
```

**Step 2: Update ChatPanel.tsx props interface**

In `src/overlay/components/ChatPanel.tsx`, replace the props interface fields:
```ts
  // Remove:
  models: ModelConfig[];
  activeModelId: string;
  onActiveModelIdChange: (id: string) => void;
  // Add:
  providers: ProviderConfig[];
  activeModelUid: string;
  onActiveModelUidChange: (uid: string) => void;
```

Add imports:
```ts
import { getAllResolvedModels, resolveModel, type ProviderConfig } from '../../lib/storage';
```

Derive flat model list inside the component:
```ts
  const allModels = getAllResolvedModels(providers);
  const activeModel = resolveModel(providers, activeModelUid);
```

Update the model selector dropdown:
```tsx
<Select value={activeModelUid} onValueChange={onActiveModelUidChange}>
  <SelectTrigger size="sm" className="max-w-[140px] h-6 text-[11px] text-muted-foreground rounded-lg px-2">
    <SelectValue placeholder="Select model" />
  </SelectTrigger>
  <SelectContent>
    {allModels.map((m) => (
      <SelectItem key={m.uid} value={m.uid}>{m.label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

Update `handleSend` to build settings from `activeModel`:
```ts
  const activeModel = resolveModel(providers, activeModelUid);
  if (!activeModel) return;
  // pass activeModel to runConversationTurn instead of settings
```

Find the `loadSettings()` call in `handleSend` and replace:
```ts
  // Before (old):
  const settings = await loadSettings();
  // After (new):
  const model = resolveModel(providers, activeModelUid);
  if (!model) { onAddMessage('system', 'No model configured. Add a provider in Settings.'); return; }
```

Then pass `model` to `runConversationTurn`:
```ts
  const finalHistory = await runConversationTurn(newHistory, model, { ... }, abort.signal, extraSystemPrompt);
```

**Step 3: Build**

```bash
npm run build
```
Expected: exit 0.

**Step 4: Commit**

```bash
git add src/overlay/App.tsx src/overlay/components/ChatPanel.tsx
git commit -m "feat: wire providers/activeModelUid through App and ChatPanel"
```

---

### Task 5: Update SettingsPanel with two-level Provider/Model UI

**Files:**
- Modify: `src/overlay/components/SettingsPanel.tsx`

This is the largest UI change. Replace the current flat model list with a two-level provider card UI.

**Step 1: Update SettingsPanel props**

Add new props to the `Props` interface:
```ts
interface Props {
  onClose: () => void;
  onModelsChange: () => void;  // keep for backwards compat (call after any provider change)
  onModalOpenChange?: (open: boolean) => void;
  providers: ProviderConfig[];
  onProvidersChange: (providers: ProviderConfig[], activeModelUid?: string) => void;
}
```

Remove all `loadModels`/`saveModels` usage. Replace internal `models` state with the `providers` prop (read-only; mutations go through `onProvidersChange`).

**Step 2: Provider list UI**

Replace the "Models" section with a "Providers" section:

```tsx
{/* Providers section */}
<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
  {providers.map((prov) => (
    <div key={prov.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Provider header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--muted)' }}>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{prov.name}</span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
          {prov.type}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditProvider(prov)}>
          {/* pencil icon */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </Button>
      </div>
      {/* Model entries under this provider */}
      <div style={{ padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {prov.models.map((entry) => (
          <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6, background: 'var(--card)' }}>
            <span style={{ flex: 1, fontSize: 12 }}>{entry.label}</span>
            <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{entry.modelId}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openEditModelEntry(prov.id, entry)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deleteModelEntry(prov.id, entry.id)}>
              <Trash2 size={10} />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="h-6 text-[11px] mt-1"
          onClick={() => addModelEntry(prov.id)}>
          <Plus size={10} className="mr-1" /> Add model
        </Button>
      </div>
    </div>
  ))}
  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={openAddProvider}>
    <Plus size={11} className="mr-1" /> Add provider
  </Button>
</div>
```

**Step 3: Provider edit modal**

Reuse the existing `Dialog` pattern for editing a provider. Fields: name (text), type (Select: anthropic/openai/ollama), apiKey (Input password), baseURL (Input).

Add state:
```ts
const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
const [provModalOpen, setProvModalOpen] = useState(false);
```

Modal save handler:
```ts
function handleProviderSave() {
  if (!editingProvider) return;
  const exists = providers.some((p) => p.id === editingProvider.id);
  const next = exists
    ? providers.map((p) => p.id === editingProvider.id ? editingProvider : p)
    : [...providers, editingProvider];
  onProvidersChange(next);
  setProvModalOpen(false);
  toast.success(exists ? 'Provider updated' : 'Provider added');
}
```

Delete handler:
```ts
function handleProviderDelete() {
  if (!editingProvider) return;
  onProvidersChange(providers.filter((p) => p.id !== editingProvider.id));
  setProvModalOpen(false);
  toast.success('Provider deleted');
}
```

When type changes in the modal, auto-fill baseURL from `PROVIDER_TYPE_DEFAULTS`:
```ts
function updateEditingProvider<K extends keyof ProviderConfig>(field: K, value: ProviderConfig[K]) {
  setEditingProvider((prev) => {
    if (!prev) return prev;
    const next = { ...prev, [field]: value };
    if (field === 'type') {
      next.baseURL = PROVIDER_TYPE_DEFAULTS[value as ProviderType].baseURL;
    }
    return next;
  });
}
```

**Step 4: Model entry edit modal / inline**

Add state:
```ts
const [editingEntry, setEditingEntry] = useState<{ providerId: string; entry: ModelEntry } | null>(null);
const [entryModalOpen, setEntryModalOpen] = useState(false);
```

Save handler:
```ts
function handleModelEntrySave() {
  if (!editingEntry) return;
  const next = providers.map((p) => {
    if (p.id !== editingEntry.providerId) return p;
    const exists = p.models.some((m) => m.id === editingEntry.entry.id);
    return {
      ...p,
      models: exists
        ? p.models.map((m) => m.id === editingEntry.entry.id ? editingEntry.entry : m)
        : [...p.models, editingEntry.entry],
    };
  });
  onProvidersChange(next);
  setEntryModalOpen(false);
}
```

`addModelEntry(providerId)` opens the modal with a new blank entry:
```ts
function addModelEntry(providerId: string) {
  const prov = providers.find((p) => p.id === providerId);
  if (!prov) return;
  const defaults = PROVIDER_TYPE_DEFAULTS[prov.type];
  setEditingEntry({ providerId, entry: { id: Date.now().toString(), label: 'New Model', modelId: defaults.modelId } });
  setEntryModalOpen(true);
}
```

`deleteModelEntry(providerId, entryId)`:
```ts
function deleteModelEntry(providerId: string, entryId: string) {
  const next = providers.map((p) =>
    p.id === providerId ? { ...p, models: p.models.filter((m) => m.id !== entryId) } : p
  );
  onProvidersChange(next);
}
```

**Step 5: Build**

```bash
npm run build
```
Expected: exit 0.

**Step 6: Commit**

```bash
git add src/overlay/components/SettingsPanel.tsx
git commit -m "feat: SettingsPanel two-level provider/model UI"
```

---

### Task 6: Final build and smoke test

**Step 1: Full build**

```bash
npm run build
```
Expected: exit 0, no TypeScript errors.

**Step 2: Manual smoke test checklist**

- Load extension in Chrome (`chrome://extensions` → Load unpacked → project root)
- Open side panel → Settings → see provider list with at least one provider
- Edit provider: change name, apiKey → save → verify persists after reload
- Add a second model under a provider → verify it appears in chat panel dropdown
- Select a model from a different provider in chat panel → send a message → verify it uses correct credentials
- Add a new provider of type OpenAI → add model → select in chat → send message
- Reload extension → verify providers and activeModelUid persist

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: provider/model abstraction complete"
```
