import { create } from 'zustand';
import { loadMcpServers, saveMcpServers, loadDisabledTools, saveDisabledTools, loadAgentDisabledTools, saveAgentDisabledTools, loadProviders, saveProviders, loadCompressThreshold, saveCompressThreshold, type McpServerConfig, type ProviderConfig } from '../lib/storage';
import { loadCustomAgents, saveCustomAgents, type Agent } from '../lib/agents';

interface ChatSessionState {
  input: string;
  isThinking: boolean;
  streamBuf: string;
  streamId: number | null;
  abortController: AbortController | null;
  askUserResolver: ((answer: string) => void) | null;
  activeAgentId: string | null;
}

const defaultSessionState = (): ChatSessionState => ({
  input: '',
  isThinking: false,
  streamBuf: '',
  streamId: null,
  abortController: null,
  askUserResolver: null,
  activeAgentId: null,
});

interface ChatStore {
  sessions: Record<string, ChatSessionState>;
  getSession: (id: string) => ChatSessionState;
  setInput: (id: string, input: string) => void;
  setIsThinking: (id: string, v: boolean) => void;
  setStreamBuf: (id: string, v: string) => void;
  setStreamId: (id: string, v: number | null) => void;
  setAbortController: (id: string, v: AbortController | null) => void;
  setAskUserResolver: (id: string, v: ((answer: string) => void) | null) => void;
  resetSession: (id: string) => void;
  customAgents: Agent[];
  setActiveAgentId: (id: string, agentId: string | null) => void;
  setCustomAgents: (agents: Agent[]) => void;
  // Shared settings
  mcpServers: McpServerConfig[];
  disabledTools: string[];
  agentDisabledTools: Record<string, string[]>;
  settingsLoaded: boolean;
  loadSharedSettings: () => Promise<void>;
  setMcpServers: (servers: McpServerConfig[]) => void;
  setDisabledTools: (tools: string[]) => void;
  setAgentDisabledTools: (map: Record<string, string[]>) => void;
  providers: ProviderConfig[];
  activeModelUid: string;
  setProviders: (providers: ProviderConfig[]) => void;
  setActiveModelUid: (uid: string) => void;
  compressThreshold: number;
  setCompressThreshold: (v: number) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: {},

  getSession: (id) => get().sessions[id] ?? defaultSessionState(),

  setInput: (id, input) =>
    set((s) => ({ sessions: { ...s.sessions, [id]: { ...(s.sessions[id] ?? defaultSessionState()), input } } })),

  setIsThinking: (id, isThinking) =>
    set((s) => ({ sessions: { ...s.sessions, [id]: { ...(s.sessions[id] ?? defaultSessionState()), isThinking } } })),

  setStreamBuf: (id, streamBuf) =>
    set((s) => ({ sessions: { ...s.sessions, [id]: { ...(s.sessions[id] ?? defaultSessionState()), streamBuf } } })),

  setStreamId: (id, streamId) =>
    set((s) => ({ sessions: { ...s.sessions, [id]: { ...(s.sessions[id] ?? defaultSessionState()), streamId } } })),

  setAbortController: (id, abortController) =>
    set((s) => ({ sessions: { ...s.sessions, [id]: { ...(s.sessions[id] ?? defaultSessionState()), abortController } } })),

  setAskUserResolver: (id, askUserResolver) =>
    set((s) => ({ sessions: { ...s.sessions, [id]: { ...(s.sessions[id] ?? defaultSessionState()), askUserResolver } } })),

  resetSession: (id) =>
    set((s) => ({ sessions: { ...s.sessions, [id]: defaultSessionState() } })),

  customAgents: [],

  setActiveAgentId: (id, activeAgentId) =>
    set((s) => ({ sessions: { ...s.sessions, [id]: { ...(s.sessions[id] ?? defaultSessionState()), activeAgentId } } })),

  setCustomAgents: (customAgents) => {
    set({ customAgents });
    saveCustomAgents(customAgents);
  },

  // Shared settings
  mcpServers: [],
  disabledTools: [],
  agentDisabledTools: {},
  settingsLoaded: false,

  providers: [],
  activeModelUid: '',
  compressThreshold: 0,

  setProviders: (providers) => {
    const { activeModelUid } = get();
    set({ providers });
    saveProviders(providers, activeModelUid);
  },

  setActiveModelUid: (activeModelUid) => {
    const { providers } = get();
    set({ activeModelUid });
    saveProviders(providers, activeModelUid);
  },

  loadSharedSettings: async () => {
    const [servers, tools, agentDisabledTools, customAgents, { providers, activeModelUid }, compressThreshold] = await Promise.all([
      loadMcpServers(), loadDisabledTools(), loadAgentDisabledTools(), loadCustomAgents(), loadProviders(), loadCompressThreshold(),
    ]);
    set({ mcpServers: servers, disabledTools: tools, agentDisabledTools, customAgents, providers, activeModelUid, compressThreshold, settingsLoaded: true });
  },

  setCompressThreshold: (v) => {
    set({ compressThreshold: v });
    saveCompressThreshold(v);
  },

  setMcpServers: (servers) => {
    set({ mcpServers: servers });
    saveMcpServers(servers);
  },

  setDisabledTools: (tools) => {
    set({ disabledTools: tools });
    saveDisabledTools(tools);
  },

  setAgentDisabledTools: (map) => {
    set({ agentDisabledTools: map });
    saveAgentDisabledTools(map);
  },
}));
