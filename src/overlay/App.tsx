import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Toaster } from 'sonner';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import ChatPanel from './components/ChatPanel';
import SettingsPanel from './components/SettingsPanel';
import { loadSessions, saveSession, deleteSession, newSession, loadProviders, saveProviders } from '../lib/storage';
import type { Session, ProviderConfig } from '../lib/storage';
import { useChatStore } from './store';

export interface ElementData {
  html: string;
  css: string;
  backendNodeId?: number;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  toolMeta?: string;
  toolResult?: string;
  toolIsError?: boolean;
  rawLogs?: { request: string; response: string }[];
  isAskUser?: boolean;
  thinkingText?: string;
  toolCall?: { name: string; input: Record<string, unknown> };
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function App() {
  const [elementData, setElementData] = useState<ElementData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [aiTabs, setAiTabs] = useState<{ id: number; title: string; url: string }[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session>(newSession());
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeModelUid, setActiveModelUid] = useState<string>('');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const msgIdRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchingRef = useRef(false);
  const loadedRef = useRef(false);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const settingsModalOpenRef = useRef(false);

  function upsertSessionList(list: Session[], session: Session) {
    const filtered = list.filter((s) => s.id !== session.id);
    return [session, ...filtered];
  }

  function stopSession(sessionId: string) {
    const store = useChatStore.getState();
    const sessionState = store.getSession(sessionId);
    sessionState.abortController?.abort();
    store.resetSession(sessionId);
    chrome.runtime.sendMessage({ action: 'toContent', action_inner: 'hideBorderFx' });
    chrome.runtime.sendMessage({ action: 'resetTabGroup' });
  }

  async function flushActiveSession() {
    if (!loadedRef.current) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSessions((prev) => upsertSessionList(prev, activeSession));
    await saveSession(activeSession);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      // Ignore clicks when a modal dialog is open
      if (settingsModalOpenRef.current) return;
      if (showHistory &&
        historyPanelRef.current && !historyPanelRef.current.contains(target) &&
        historyBtnRef.current && !historyBtnRef.current.contains(target)) {
        setShowHistory(false);
      }
      if (showSettings &&
        settingsPanelRef.current && !settingsPanelRef.current.contains(target) &&
        settingsBtnRef.current && !settingsBtnRef.current.contains(target)) {
        setShowSettings(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHistory, showSettings]);

  useEffect(() => {
    useChatStore.getState().loadSharedSettings();
    Promise.all([loadSessions(), loadProviders()]).then(([loaded, { providers: ps, activeModelUid: uid }]) => {
      setProviders(ps);
      setActiveModelUid(uid);
      if (loaded.length > 0) {
        setSessions(loaded);
        setActiveSession(loaded[0]);
        msgIdRef.current = loaded[0].messages.reduce((max, m) => Math.max(max, m.id), 0);
      }
      loadedRef.current = true;
    });
  }, []);

  // Auto-save active session (debounced), guarded by loadedRef and switchingRef
  useEffect(() => {
    if (!loadedRef.current || switchingRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (switchingRef.current) return;
      setSessions((prev) => upsertSessionList(prev, activeSession));
      void saveSession(activeSession);
    }, 600);
  }, [activeSession]);

  function nextId() {
    msgIdRef.current += 1;
    return msgIdRef.current;
  }

  function addMessage(role: ChatMessage['role'], text: string, toolMeta?: string) {
    const msg: ChatMessage = { id: nextId(), role, text, toolMeta };
    setActiveSession((prev) => {
      const messages = [...prev.messages, msg];
      const title = messages.find((m) => m.role === 'user')?.text.slice(0, 48) ?? prev.title;
      return { ...prev, messages, title };
    });
  }

  function appendRawLog(log: { request: string; response: string }) {
    setActiveSession((prev) => {
      const messages = [...prev.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], rawLogs: [...(messages[i].rawLogs ?? []), log] };
          break;
        }
      }
      return { ...prev, messages };
    });
  }

  function markLastMessageAsAskUser() {
    setActiveSession((prev) => {
      const msgs = [...prev.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, isAskUser: true };
      }
      return { ...prev, messages: msgs };
    });
  }

  function removeLastStreamingMessage() {
    setActiveSession((prev) => {
      const msgs = prev.messages;
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        return { ...prev, messages: msgs.slice(0, -1) };
      }
      return prev;
    });
  }

  function patchLastAssistantThinking(thinkingText: string) {
    setActiveSession((prev) => {
      const messages = [...prev.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], thinkingText };
          break;
        }
      }
      return { ...prev, messages };
    });
  }

  function patchLastToolResult(result: string, isError?: boolean) {
    setActiveSession((prev) => {
      const messages = [...prev.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].toolMeta === 'tool') {
          messages[i] = { ...messages[i], toolResult: result, toolIsError: isError };
          break;
        }
      }
      return { ...prev, messages };
    });
  }

  function deleteMessage(id: number) {
    setActiveSession((prev) => ({ ...prev, messages: prev.messages.filter((m) => m.id !== id) }));
  }

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

  useEffect(() => {
    function onStreamPatch(e: Event) {
      const text = (e as CustomEvent<{ text: string }>).detail.text;
      setActiveSession((prev) => {
        const msgs = prev.messages;
        const last = msgs[msgs.length - 1];
        if (last?.role === 'assistant') {
          return { ...prev, messages: [...msgs.slice(0, -1), { ...last, text }] };
        }
        return prev;
      });
    }
    window.addEventListener('ai-stream-patch', onStreamPatch);
    return () => window.removeEventListener('ai-stream-patch', onStreamPatch);
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'panelReady' });
    function onMessage(msg: Record<string, unknown>) {
      const { type } = msg;
      if (type === 'LOADING') {
        setIsLoading(true);
        addMessage('system', 'Inspecting element…');
      } else if (type === 'ERROR') {
        setIsLoading(false);
        addMessage('system', `Error: ${msg.message}`);
      } else if (type === 'TAB_CHANGED') {
        setIsLoading(false);
      } else if (type === 'AI_TABS_UPDATE') {
        setAiTabs(Array.isArray(msg.tabs) ? msg.tabs as { id: number; title: string; url: string }[] : []);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  async function handleNewSession() {
    switchingRef.current = true;
    try {
      await flushActiveSession();
      stopSession(activeSession.id);
      setActiveSession(newSession());
      msgIdRef.current = 0;
      setIsLoading(false);
      setShowHistory(false);
      setShowSettings(false);
      setAiTabs([]);
    } finally {
      switchingRef.current = false;
    }
  }

  async function handleSwitchSession(s: Session) {
    switchingRef.current = true;
    try {
      if (activeSession.id !== s.id) {
        await flushActiveSession();
        stopSession(activeSession.id);
      }
      setActiveSession(s);
      msgIdRef.current = s.messages.reduce((max, m) => Math.max(max, m.id), 0);
      setShowHistory(false);
      setAiTabs([]);
    } finally {
      switchingRef.current = false;
    }
  }

  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (deletingSessionId) return;
    switchingRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setDeletingSessionId(id);
    try {
      if (activeSession.id !== id) {
        await flushActiveSession();
      } else {
        stopSession(id);
      }
      await deleteSession(id);
      const updated = await loadSessions();
      setSessions(updated);
      if (activeSession.id === id) {
        if (updated.length > 0) {
          setActiveSession(updated[0]);
          msgIdRef.current = updated[0].messages.reduce((max, m) => Math.max(max, m.id), 0);
        } else {
          setActiveSession(newSession());
          msgIdRef.current = 0;
          setShowHistory(false);
        }
      }
    } finally {
      setDeletingSessionId(null);
      switchingRef.current = false;
    }
  }

  function handleRenameSession(id: string, newTitle: string) {
    const trimmed = newTitle.trim();
    if (!trimmed) { setRenamingSessionId(null); return; }
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title: trimmed } : s));
    if (activeSession.id === id) setActiveSession((prev) => ({ ...prev, title: trimmed }));
    const target = sessions.find((s) => s.id === id);
    if (target) void saveSession({ ...target, title: trimmed });
    setRenamingSessionId(null);
  }

  function handleHistoryChange(history: MessageParam[]) {
    setActiveSession((prev) => ({ ...prev, history }));
  }

  function handleActiveModelUidChange(uid: string) {
    setActiveModelUid(uid);
    saveProviders(providers, uid);
  }

  function handleProvidersChange(ps: ProviderConfig[], newActiveUid?: string) {
    setProviders(ps);
    const uid = newActiveUid ?? activeModelUid;
    setActiveModelUid(uid);
    saveProviders(ps, uid);
  }

  function handleCloseAiTab(tabId: number) {
    chrome.tabs.remove(tabId).catch(() => {});
    setAiTabs((prev) => prev.filter((t) => t.id !== tabId));
  }

  function handleCloseAllAiTabs() {
    aiTabs.forEach((t) => chrome.tabs.remove(t.id).catch(() => {}));
    setAiTabs([]);
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <span className="text-xs font-semibold tracking-tight truncate">
            {(activeSession.title === 'New chat' || activeSession.title === '新建对话') ? 'AI 助手' : activeSession.title}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isLoading && (
            <svg className="animate-spin text-primary mr-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewSession} title="新建对话" disabled={activeSession.messages.length === 0}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </Button>
          <Button ref={historyBtnRef} variant="ghost" size="icon" className={cn('h-7 w-7', showHistory && 'bg-accent text-accent-foreground')} onClick={() => { setShowHistory((s) => !s); setShowSettings(false); }} title="历史记录">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <circle cx="3.5" cy="6" r="1"/>
              <circle cx="3.5" cy="12" r="1"/>
              <circle cx="3.5" cy="18" r="1"/>
            </svg>
          </Button>
          <Button ref={settingsBtnRef} variant="ghost" size="icon" className={cn('h-7 w-7', showSettings && 'bg-accent text-accent-foreground')} onClick={() => { setShowSettings((s) => !s); setShowHistory(false); }} title="设置">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </Button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div ref={historyPanelRef} className="flex-1 min-h-0 overflow-y-auto border-b border-border p-3 flex flex-col gap-1.5">
          {sessions.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-3">暂无保存的对话</div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => handleSwitchSession(s)}
              className={cn(
                'flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer border transition-colors gap-2',
                s.id === activeSession.id
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 border-border hover:bg-muted'
              )}
            >
              <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                {renamingSessionId === s.id ? (
                  <input
                    autoFocus
                    className="text-xs font-medium w-full bg-transparent border-b border-primary outline-none text-foreground"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSession(s.id, renameValue)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSession(s.id, renameValue);
                      if (e.key === 'Escape') setRenamingSessionId(null);
                    }}
                  />
                ) : (
                  <div
                    className={cn('text-xs font-medium truncate', s.id === activeSession.id ? 'text-primary' : 'text-foreground')}
                    onDoubleClick={(e) => { e.stopPropagation(); setRenamingSessionId(s.id); setRenameValue(s.title); }}
                    title="双击重命名"
                  >
                    {s.title}
                  </div>
                )}
                <div className="text-[10.5px] text-muted-foreground mt-0.5">
                  {formatDate(s.createdAt)} · {s.messages.filter(m => m.role !== 'system').length} msgs
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-5 w-5 shrink-0', deletingSessionId === s.id ? 'opacity-100' : 'opacity-60')}
                onClick={(e) => handleDeleteSession(s.id, e)}
                title={deletingSessionId === s.id ? 'Deleting' : 'Delete'}
                disabled={deletingSessionId !== null}
              >
                {deletingSessionId === s.id ? (
                  <svg className="animate-spin text-primary" width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div ref={settingsPanelRef} className="flex flex-col flex-1 h-0 overflow-hidden">
          <SettingsPanel onClose={() => setShowSettings(false)} providers={providers} activeModelUid={activeModelUid} onProvidersChange={handleProvidersChange} onModelsChange={() => {}} onModalOpenChange={(open) => { settingsModalOpenRef.current = open; }} />
        </div>
      )}

      {/* Chat */}
      <div style={{ display: (showSettings || showHistory) ? 'none' : 'contents' }}>
        <ChatPanel
          key={activeSession.id}
          sessionId={activeSession.id}
          aiTabs={aiTabs}
          onCloseAiTab={handleCloseAiTab}
          onCloseAllAiTabs={handleCloseAllAiTabs}
          messages={activeSession.messages}
          onAddMessage={addMessage}
          onPatchLastToolResult={patchLastToolResult}
          onPatchLastAssistantThinking={patchLastAssistantThinking}
          onRemoveLastStreamingMessage={removeLastStreamingMessage}
          onMarkLastMessageAsAskUser={markLastMessageAsAskUser}
          onAppendRawLog={appendRawLog}
          onRecordToolCall={recordToolCall}
          onDeleteMessage={deleteMessage}
          sessions={sessions}
          elementData={elementData}
          history={activeSession.history}
          onHistoryChange={handleHistoryChange}
          providers={providers}
          activeModelUid={activeModelUid}
          onActiveModelUidChange={handleActiveModelUidChange}
        />
      </div>
      <Toaster position="bottom-center" richColors />
    </div>
  );
}
