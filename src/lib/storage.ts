import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { ChatMessage } from '../overlay/App';

export type Provider = 'anthropic' | 'openai' | 'ollama';

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

const PAGE_CTX_MARKER = '[__page_ctx__]';

export async function saveSession(session: Session): Promise<void> {
  // Strip page context messages from history before persisting — they are re-injected each turn
  const strippedHistory = session.history.filter(
    (m) =>
      !(m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(PAGE_CTX_MARKER)) &&
      !(m.role === 'assistant' && typeof m.content === 'string' && m.content === 'Page context received.')
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
