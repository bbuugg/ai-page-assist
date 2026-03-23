import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { ChatMessage } from '../overlay/App';

export type Provider = 'anthropic' | 'openai' | 'ollama';

export type ProviderType = 'anthropic' | 'openai' | 'ollama';

export interface ModelEntry {
  id: string;       // unique within provider
  label: string;    // display name, e.g. "Claude Sonnet"
  modelId: string;  // API string, e.g. "claude-sonnet-4-6"
  thinking?: { enabled: boolean; budgetTokens: number };
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
  thinking?: { enabled: boolean; budgetTokens: number };
}

export const PROVIDER_TYPE_DEFAULTS: Record<ProviderType, { baseURL: string; modelId: string; placeholder: string }> = {
  anthropic: { baseURL: 'https://api.anthropic.com',  modelId: 'claude-sonnet-4-6', placeholder: 'sk-ant-…' },
  openai:    { baseURL: 'https://api.openai.com/v1',   modelId: 'gpt-4o',             placeholder: 'sk-…' },
  ollama:    { baseURL: 'http://localhost:11434/v1',    modelId: 'llama3.2',           placeholder: '(no key needed)' },
};

export function resolveModel(providers: ProviderConfig[], uid: string): ResolvedModel | undefined {
  const slashIdx = uid.indexOf('/');
  if (slashIdx === -1) return undefined;
  const providerId = uid.slice(0, slashIdx);
  const modelEntryId = uid.slice(slashIdx + 1);
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
    thinking: entry.thinking,
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
      thinking: entry.thinking,
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
        chrome.storage.local.remove(['models', 'activeModelId']);
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
        chrome.storage.local.remove(['provider', 'apiKey', 'baseURL', 'model']);
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

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
  history: MessageParam[];
}

export async function loadSessions(): Promise<Session[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sessions'], (result) => {
      resolve(result.sessions ?? []);
    });
  });
}

const PAGE_CTX_MARKER = '[Page context]';

export async function saveSession(session: Session): Promise<void> {
  // Strip page context prefix from history before persisting — it is re-injected each turn
  const strippedHistory = session.history.map((m) => {
    if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(PAGE_CTX_MARKER)) {
      const userMsgStart = m.content.indexOf('\n\n[User message]\n');
      const stripped = userMsgStart >= 0 ? m.content.slice(userMsgStart + '\n\n[User message]\n'.length) : m.content;
      return { ...m, content: stripped };
    }
    return m;
  }).filter(
    (m) => !(m.role === 'assistant' && typeof m.content === 'string' && m.content === 'Page context received.')
  );
  const toSave = { ...session, history: strippedHistory };
  const sessions = await loadSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) sessions[idx] = toSave;
  else sessions.unshift(toSave);
  return new Promise((resolve) => chrome.storage.local.set({ sessions }, resolve));
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await loadSessions();
  return new Promise((resolve) =>
    chrome.storage.local.set({ sessions: sessions.filter((s) => s.id !== id) }, resolve)
  );
}

export function newSession(): Session {
  return { id: Date.now().toString(), title: 'New chat', createdAt: Date.now(), messages: [], history: [] };
}

export interface Settings {
  provider: Provider;
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: Provider;
  apiKey: string;
  baseURL: string;
  model: string;
}

export const PROVIDER_DEFAULTS: Record<Provider, { baseURL: string; model: string; placeholder: string }> = {
  anthropic: { baseURL: 'https://api.anthropic.com', model: 'claude-sonnet-4-6', placeholder: 'sk-ant-…' },
  openai:    { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o',             placeholder: 'sk-…' },
  ollama:    { baseURL: 'http://localhost:11434/v1',  model: 'llama3.2',           placeholder: '(no key needed)' },
};

const DEFAULT_MODELS: ModelConfig[] = [
  { id: 'default-anthropic', name: 'Claude Sonnet', provider: 'anthropic', apiKey: '', baseURL: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
];

export async function loadModels(): Promise<{ models: ModelConfig[]; activeModelId: string }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['models', 'activeModelId', 'provider', 'apiKey', 'baseURL', 'model'], (result) => {
      if (result.models) {
        resolve({ models: result.models, activeModelId: result.activeModelId ?? result.models[0]?.id });
      } else {
        // Migrate from old Settings format
        const migrated: ModelConfig[] = [{
          id: 'migrated-1',
          name: result.provider === 'openai' ? 'GPT-4o' : result.provider === 'ollama' ? 'Ollama' : 'Claude Sonnet',
          provider: result.provider ?? 'anthropic',
          apiKey: result.apiKey ?? '',
          baseURL: result.baseURL ?? 'https://api.anthropic.com',
          model: result.model ?? 'claude-sonnet-4-6',
        }];
        const models = result.apiKey ? migrated : DEFAULT_MODELS;
        resolve({ models, activeModelId: models[0].id });
      }
    });
  });
}

export async function loadDisabledTools(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['disabledTools'], (result) => {
      resolve(result.disabledTools ?? []);
    });
  });
}

export async function saveDisabledTools(disabledTools: string[]): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ disabledTools }, resolve));
}

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

export async function loadCompressThreshold(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['compressThreshold'], (result) => {
      resolve(result.compressThreshold ?? 0);
    });
  });
}

export async function saveCompressThreshold(threshold: number): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ compressThreshold: threshold }, resolve));
}

export async function saveModels(models: ModelConfig[], activeModelId: string): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ models, activeModelId }, resolve));
}

// Keep for backwards compat
export async function loadSettings(): Promise<Settings> {
  const { models, activeModelId } = await loadModels();
  const m = models.find((x) => x.id === activeModelId) ?? models[0];
  return { provider: m.provider, apiKey: m.apiKey, baseURL: m.baseURL, model: m.model };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(settings, resolve);
  });
}

// ---- MCP Servers ----
import type { McpServerConfig } from './mcp';
export type { McpServerConfig };

export async function loadMcpServers(): Promise<McpServerConfig[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['mcpServers'], (result) => {
      resolve(result.mcpServers ?? []);
    });
  });
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ mcpServers: servers }, resolve));
}
