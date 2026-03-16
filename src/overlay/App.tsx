import { useState, useEffect, useRef } from 'react';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import ChatPanel from './components/ChatPanel';
import SettingsPanel from './components/SettingsPanel';
import { loadSessions, saveSession, deleteSession, newSession, loadModels, saveModels } from '../lib/storage';
import type { Session, ModelConfig } from '../lib/storage';

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
  rawLogs?: { request: string; response: string }[];
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session>(newSession());
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>('');
  const msgIdRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchingRef = useRef(false);
  const loadedRef = useRef(false);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
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
    Promise.all([loadSessions(), loadModels()]).then(([loaded, { models: ms, activeModelId: aid }]) => {
      setModels(ms);
      setActiveModelId(aid);
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
      saveSession(activeSession).then(() => loadSessions().then(setSessions));
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

  function patchLastToolResult(result: string) {
    setActiveSession((prev) => {
      const messages = [...prev.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].toolMeta === 'tool') {
          messages[i] = { ...messages[i], toolResult: result };
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
      if (type === 'ELEMENT_DATA') {
        setIsLoading(false);
        setElementData({ html: msg.html as string, css: msg.css as string, backendNodeId: msg.backendNodeId as number | undefined });
      } else if (type === 'LOADING') {
        setIsLoading(true);
        addMessage('system', 'Inspecting element…');
      } else if (type === 'ERROR') {
        setIsLoading(false);
        addMessage('system', `Error: ${msg.message}`);
      } else if (type === 'TAB_CHANGED') {
        setIsLoading(false);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  function handleNewSession() {
    switchingRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setActiveSession(newSession());
    msgIdRef.current = 0;
    setShowHistory(false);
    setShowSettings(false);
    switchingRef.current = false;
  }

  function handleSwitchSession(s: Session) {
    switchingRef.current = true;
    setActiveSession(s);
    msgIdRef.current = s.messages.reduce((max, m) => Math.max(max, m.id), 0);
    setShowHistory(false);
    switchingRef.current = false;
  }

  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    switchingRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
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
    switchingRef.current = false;
  }

  function handleHistoryChange(history: MessageParam[]) {
    setActiveSession((prev) => ({ ...prev, history }));
  }

  function handleActiveModelIdChange(id: string) {
    setActiveModelId(id);
    loadModels().then(({ models: ms }) => {
      saveModels(ms, id);
    });
  }

  function handleModelsChange() {
    loadModels().then(({ models: ms, activeModelId: aid }) => {
      setModels(ms);
      const valid = ms.find((m) => m.id === aid) ? aid : ms[0]?.id ?? '';
      setActiveModelId(valid);
    });
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 30, height: 30,
    borderRadius: 50,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? 'var(--accent-glass)' : 'var(--glass-bg)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--glass-border)',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
    boxShadow: active ? '0 0 12px var(--accent-glow)' : 'var(--glass-shadow-sm)',
    flexShrink: 0,
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      {/* Header */}
      <div
        className="glass-strong shrink-0"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: 'var(--accent-send)', boxShadow: '0 0 8px var(--accent-glow), 0 0 2px var(--accent)' }} />
          <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeSession.title === 'New chat' ? 'AI Assist' : activeSession.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {isLoading && (
            <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)', marginRight: 2 }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          )}
          <button onClick={handleNewSession} title="New chat" style={btnStyle(false)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button ref={historyBtnRef} onClick={() => { setShowHistory((s) => !s); setShowSettings(false); }} title="History" style={btnStyle(showHistory)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
            </svg>
          </button>
          <button ref={settingsBtnRef} onClick={() => { setShowSettings((s) => !s); setShowHistory(false); }} title="Settings" style={btnStyle(showSettings)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div ref={historyPanelRef} className="shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)', maxHeight: 280, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sessions.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '12px 0' }}>No saved sessions</div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => handleSwitchSession(s)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px',
                borderRadius: 12,
                cursor: 'pointer',
                background: s.id === activeSession.id ? 'var(--accent-glass)' : 'var(--glass-bg)',
                border: `1px solid ${s.id === activeSession.id ? 'var(--accent)' : 'var(--glass-border)'}`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                transition: 'all 0.15s',
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 550, color: s.id === activeSession.id ? 'var(--accent)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                  {formatDate(s.createdAt)} · {s.messages.filter(m => m.role !== 'system').length} msgs
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteSession(s.id, e)}
                title="Delete"
                style={{ width: 22, height: 22, borderRadius: 50, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.6 }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div ref={settingsPanelRef}>
          <SettingsPanel onClose={() => setShowSettings(false)} onModelsChange={handleModelsChange} />
        </div>
      )}

      {/* Chat */}
      {!showSettings && (
        <ChatPanel
          messages={activeSession.messages}
          onAddMessage={addMessage}
          onPatchLastToolResult={patchLastToolResult}
          onAppendRawLog={appendRawLog}
          elementData={elementData}
          history={activeSession.history}
          onHistoryChange={handleHistoryChange}
          models={models}
          activeModelId={activeModelId}
          onActiveModelIdChange={handleActiveModelIdChange}
        />
      )}
    </div>
  );
}
