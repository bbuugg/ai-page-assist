# Provider/Model Abstraction Design

**Date:** 2026-03-23

## Goal

Add a Provider abstraction layer between the UI and the AI runner. Users configure credentials (baseURL, apiKey) once per provider, then add multiple model entries under each provider. The chat panel selects from the flat list of resolved models.

## Data Model

```ts
export type ProviderType = 'anthropic' | 'openai' | 'ollama';

export interface ProviderConfig {
  id: string;          // e.g. "prov-1234"
  name: string;        // display name, e.g. "My Anthropic"
  type: ProviderType;  // determines which AI runner to use
  apiKey: string;
  baseURL: string;
  models: ModelEntry[];
}

export interface ModelEntry {
  id: string;          // unique within provider, e.g. "m-1234"
  label: string;       // display name, e.g. "Claude Sonnet"
  modelId: string;     // API model string, e.g. "claude-sonnet-4-6"
}

// Derived flat view used by chat panel selector and AI runner
export interface ResolvedModel {
  uid: string;         // "<providerId>/<modelEntryId>"
  label: string;       // display: "ProviderName / ModelLabel"
  providerName: string;
  type: ProviderType;
  apiKey: string;
  baseURL: string;
  modelId: string;     // the actual API model string
}
```

Migration: existing `ModelConfig[]` in storage → each becomes one `ProviderConfig` with a single `ModelEntry`.

## Storage Layer (`src/lib/storage.ts`)

- Add `ProviderConfig`, `ModelEntry`, `ResolvedModel` types
- Remove `ModelConfig` (keep only as migration helper internally)
- `loadProviders(): Promise<ProviderConfig[]>` — loads from `providers` key, migrates old `models` key
- `saveProviders(providers: ProviderConfig[]): Promise<void>`
- `loadActiveModelUid(): Promise<string>` / `saveActiveModelUid(uid: string)`
- Helper: `resolveModel(providers, uid): ResolvedModel | undefined`
- Helper: `getAllResolvedModels(providers): ResolvedModel[]`
- Remove `ModelConfig`, `loadModels`, `saveModels` exports (keep `loadSettings` shim for backwards compat)

## AI Runner (`src/lib/ai/`)

- `runConversationTurn(history, model: ResolvedModel, callbacks, signal, extraSystemPrompt)` — `Settings` replaced by `ResolvedModel`
- `anthropic.ts`: reads `model.type === 'anthropic'`, uses `model.apiKey`, `model.baseURL`, `model.modelId`
- `openai.ts`: used for `openai` and `ollama` types, uses same fields
- `Provider` type removed (replaced by `ProviderType`)

## Zustand Store (`src/overlay/store.ts`)

- Replace `mcpServers`-adjacent model state with `providers: ProviderConfig[]` + `activeModelUid: string`
- Actions: `setProviders`, `setActiveModelUid`
- `loadSharedSettings` loads providers + activeModelUid in parallel with MCP/tools

## UI

### SettingsPanel — Providers section
- List of provider cards (name, type badge, baseURL, masked apiKey)
- Expandable: shows model entries (label + modelId), inline add/delete per model
- "Add Provider" button → modal: name, type selector, apiKey, baseURL
- Model entry edit: label + modelId fields inline

### Chat Panel model selector
- Flat dropdown of all `ResolvedModel`s
- Display: `ProviderName / ModelLabel`
- Selected value: `uid` string

### App.tsx / ChatPanel.tsx
- Props: `providers: ProviderConfig[]` + `activeModelUid: string` (replacing `models` + `activeModelId`)
- `resolveModel(providers, activeModelUid)` called before `runConversationTurn`

## Migration Strategy

`loadProviders()` checks for `providers` key first. If absent, reads old `models` key and converts each `ModelConfig` into a `ProviderConfig` with one `ModelEntry`. Saves migrated data back under `providers` key.
