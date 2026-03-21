import { create } from 'zustand';
import { loadMcpServers, saveMcpServers, loadDisabledTools, saveDisabledTools, type McpServerConfig } from '../lib/storage';

interface ChatSessionState {
  input: string;
  isThinking: boolean;
  streamBuf: string;
  streamId: number | null;
  abortController: AbortController | null;
  askUserResolver: ((answer: string) => void) | null;
}

const defaultSessionState = (): ChatSessionState => ({
  input: '',
  isThinking: false,
  streamBuf: '',
  streamId: null,
  abortController: null,
  askUserResolver: null,
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
  // Shared settings
  mcpServers: McpServerConfig[];
  disabledTools: string[];
  settingsLoaded: boolean;
  loadSharedSettings: () => Promise<void>;
  setMcpServers: (servers: McpServerConfig[]) => void;
  setDisabledTools: (tools: string[]) => void;
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

  // Shared settings
  mcpServers: [],
  disabledTools: [],
  settingsLoaded: false,

  loadSharedSettings: async () => {
    const [servers, tools] = await Promise.all([loadMcpServers(), loadDisabledTools()]);
    set({ mcpServers: servers, disabledTools: tools, settingsLoaded: true });
  },

  setMcpServers: (servers) => {
    set({ mcpServers: servers });
    saveMcpServers(servers);
  },

  setDisabledTools: (tools) => {
    set({ disabledTools: tools });
    saveDisabledTools(tools);
  },
}));
