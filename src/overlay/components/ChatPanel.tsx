import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useChatStore } from '../store';
import { marked, Renderer } from 'marked';

const renderer = new Renderer();
renderer.link = ({ href, title, text }: { href: string; title?: string | null; text: string }) => {
  const t = title ? ` title="${title}"` : '';
  return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
};
marked.use({ renderer });
import 'github-markdown-css/github-markdown.css';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { ChatMessage } from '../App';
import { runConversationTurn } from '../../lib/ai';
import { loadMcpServers, saveMcpServers, loadDisabledTools, saveDisabledTools, type ModelConfig, type McpServerConfig } from '../../lib/storage';
import { executeTool } from '../../lib/tools/index';
import { fetchMcpTools, type McpTool } from '../../lib/mcp';

interface Props {
  sessionId: string;
  messages: ChatMessage[];
  onAddMessage: (role: ChatMessage['role'], text: string, toolMeta?: string) => void;
  onPatchLastToolResult: (result: string) => void;
  onRemoveLastStreamingMessage: () => void;
  onMarkLastMessageAsAskUser: () => void;
  onAppendRawLog: (log: { request: string; response: string }) => void;
  elementData: { html: string; css: string } | null;
  history: MessageParam[];
  onHistoryChange: (history: MessageParam[]) => void;
  models: ModelConfig[];
  activeModelId: string;
  onActiveModelIdChange: (id: string) => void;
}

const RawLogPanel = memo(function RawLogPanel({ logs }: { logs: { request: string; response: string }[] }) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('request');
  return (
    <div style={{ maxWidth: '92%', marginTop: 3 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
        Raw ({logs.length})
      </button>
      {open && (
        <div className="glass" style={{ borderRadius: 10, padding: '8px 10px', fontSize: 10.5, marginTop: 2 }}>
          {logs.length > 1 && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {logs.map((_, i) => (
                <button key={i} onClick={() => setActiveIdx(i)} style={{ background: activeIdx === i ? 'var(--accent-glass)' : 'none', border: activeIdx === i ? '1px solid var(--accent-glow)' : '1px solid transparent', borderRadius: 6, color: activeIdx === i ? 'var(--accent)' : 'var(--text-muted)', fontSize: 10, padding: '1px 7px', cursor: 'pointer' }}>Turn {i + 1}</button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {(['request', 'response'] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)} style={{ background: activeTab === t ? 'var(--accent-glass)' : 'none', border: activeTab === t ? '1px solid var(--accent-glow)' : '1px solid transparent', borderRadius: 6, color: activeTab === t ? 'var(--accent)' : 'var(--text-muted)', fontSize: 10, padding: '1px 7px', cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
            ))}
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-muted)', maxHeight: 260, overflowY: 'auto', lineHeight: 1.45 }}>{logs[activeIdx]?.[activeTab]}</pre>
        </div>
      )}
    </div>
  );
});

const ToolMessage = memo(function ToolMessage({ msg }: { msg: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const isTool = msg.toolMeta === 'tool';
  if (!isTool) {
    return (
      <span style={{ fontSize: 11, color: 'var(--text-system)', lineHeight: 1.5, padding: '4px 10px', background: 'var(--msg-system-bg)', borderRadius: 10, fontStyle: 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {msg.text}
      </span>
    );
  }
  return (
    <div style={{ fontSize: 11, color: 'var(--text-system)', borderRadius: 10, overflow: 'hidden', background: 'var(--msg-system-bg)', maxWidth: '92%' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', color: 'var(--text-system)', fontStyle: 'italic', fontSize: 11, fontFamily: 'inherit', textAlign: 'left' }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {msg.text}
      </button>
      {open && msg.toolResult && (
        <div style={{ padding: '0 10px 8px 10px', borderTop: '1px solid var(--border-subtle)' }}>
          <pre style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto', lineHeight: 1.45 }}>{msg.toolResult}</pre>
        </div>
      )}
      {open && !msg.toolResult && (
        <div style={{ padding: '0 10px 8px 10px', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 10 }}>waiting…</div>
      )}
    </div>
  );
});

export default function ChatPanel({ sessionId, messages, onAddMessage, onPatchLastToolResult, onRemoveLastStreamingMessage, onMarkLastMessageAsAskUser, onAppendRawLog, elementData, history, onHistoryChange, models, activeModelId, onActiveModelIdChange }: Props) {
  const store = useChatStore();
  const sess = store.getSession(sessionId);
  const input = sess.input;
  const setInput = (v: string) => store.setInput(sessionId, v);
  const isThinking = sess.isThinking;
  const setIsThinking = (v: boolean) => store.setIsThinking(sessionId, v);
  const [unreadCount, setUnreadCount] = useState(0);
  const historyRef = useRef<MessageParam[]>(history);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const genRef = useRef(0);
  // streamBuf, streamId, abortController, askUserResolver live in store
  const streamBufRef = {
    get current() { return useChatStore.getState().getSession(sessionId).streamBuf; },
    set current(v: string) { useChatStore.getState().setStreamBuf(sessionId, v); },
  };
  const streamIdRef = {
    get current() { return useChatStore.getState().getSession(sessionId).streamId; },
    set current(v: number | null) { useChatStore.getState().setStreamId(sessionId, v); },
  };
  const abortRef = {
    get current() { return useChatStore.getState().getSession(sessionId).abortController; },
    set current(v: AbortController | null) { useChatStore.getState().setAbortController(sessionId, v); },
  };
  const askUserResolverRef = {
    get current() { return useChatStore.getState().getSession(sessionId).askUserResolver; },
    set current(v: ((answer: string) => void) | null) { useChatStore.getState().setAskUserResolver(sessionId, v); },
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMcpPopover, setShowMcpPopover] = useState(false);
  const [mcpPopoverPos, setMcpPopoverPos] = useState<{ bottom: number; left: number } | null>(null);
  const mcpBtnRef = useRef<HTMLButtonElement>(null);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [mcpTools, setMcpTools] = useState<Record<string, McpTool[]>>({});
  const [mcpToolsLoading, setMcpToolsLoading] = useState<Record<string, boolean>>({});
  const [mcpExpandedServers, setMcpExpandedServers] = useState<Record<string, boolean>>({});
  const mcpPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMcpServers().then(setMcpServers);
    loadDisabledTools().then(setDisabledTools);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (showMcpPopover && 
          mcpPopoverRef.current && !mcpPopoverRef.current.contains(target) && 
          mcpBtnRef.current && !mcpBtnRef.current.contains(target)) {
        setShowMcpPopover(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMcpPopover]);

  useEffect(() => {
    const abort = useChatStore.getState().getSession(sessionId).abortController;
    if (abort) abort.abort();
    useChatStore.getState().resetSession(sessionId);
  }, [sessionId]);

  async function refreshMcpToolsForServer(srv: McpServerConfig) {
    setMcpToolsLoading((prev) => ({ ...prev, [srv.id]: true }));
    try {
      const tools = await fetchMcpTools(srv);
      setMcpTools((prev) => ({ ...prev, [srv.id]: tools }));
      setMcpExpandedServers((prev) => ({ ...prev, [srv.id]: true }));
    } finally {
      setMcpToolsLoading((prev) => ({ ...prev, [srv.id]: false }));
    }
  }

  function toggleMcpServer(id: string, enabled: boolean) {
    const next = mcpServers.map((s) => s.id === id ? { ...s, enabled } : s);
    setMcpServers(next);
    saveMcpServers(next);
  }

  function toggleMcpTool(toolName: string) {
    const next = disabledTools.includes(toolName)
      ? disabledTools.filter((t) => t !== toolName)
      : [...disabledTools, toolName];
    setDisabledTools(next);
    saveDisabledTools(next);
  }

  const checkAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (force || isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    } else {
      setUnreadCount((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      isAtBottomRef.current = checkAtBottom();
      if (isAtBottomRef.current) setUnreadCount(0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [checkAtBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    function onStreamPatch() {
      scrollToBottom();
    }
    window.addEventListener('ai-stream-patch', onStreamPatch);
    return () => window.removeEventListener('ai-stream-patch', onStreamPatch);
  }, [scrollToBottom]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    if (!elementData) return;
    const ctx = `[Page context updated]\nHTML:\n${elementData.html}\n\nCSS:\n${elementData.css}`;
    const filtered = historyRef.current.filter(
      (m) => !(m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('[Page context updated]'))
    );
    const next = [{ role: 'user' as const, content: ctx }, { role: 'assistant' as const, content: 'Context received.' }, ...filtered];
    historyRef.current = next;
    onHistoryChange(next);
  }, [elementData]);

  async function handleSend(override?: string) {
    const text = (override ?? input).trim();
    if (!text) return;

    // If AI is waiting for user answer (ask_user tool), resolve it
    if (askUserResolverRef.current) {
      const resolve = askUserResolverRef.current;
      askUserResolverRef.current = null;
      setInput('');
      onAddMessage('user', text);
      // Reset stream state so next AI response renders as a fresh message
      streamBufRef.current = '';
      streamIdRef.current = null;
      setIsThinking(true);
      chrome.runtime.sendMessage({ action: 'toContent', action_inner: 'showBorderFx' });
      resolve(text);
      return;
    }

    // If AI is currently responding, abort it and discard partial response
    if (abortRef.current) {
      abortRef.current.abort();
      // Remove the partial streaming message from UI
      if (streamIdRef.current !== null) {
        onRemoveLastStreamingMessage();
        streamIdRef.current = null;
      }
      // Discard partial assistant response — do NOT add to history
      // so the new user message starts from the last complete state
      streamBufRef.current = '';
      abortRef.current = null;
    }

    if (!override) setInput('');
    onAddMessage('user', text);
    setIsThinking(true);
    chrome.runtime.sendMessage({ action: 'toContent', action_inner: 'showBorderFx' });
    streamBufRef.current = '';
    streamIdRef.current = null;
    chrome.runtime.sendMessage({ action: 'setActiveSession', sessionId });
    const abort = new AbortController();
    abortRef.current = abort;
    const myGen = ++genRef.current;

    const activeModel = models.find((m) => m.id === activeModelId) ?? models[0];
    if (!activeModel) {
      onAddMessage('system', 'No model configured. Open Settings and add a model.');
      setIsThinking(false);
      return;
    }
    if (!activeModel.apiKey && activeModel.provider !== 'ollama') {
      onAddMessage('system', 'No API key set. Open Settings and enter your API key.');
      setIsThinking(false);
      return;
    }
    const settings = activeModel;

    // Silently inject current page HTML as hidden context if missing or stale
    const PAGE_CTX_MARKER = '[__page_ctx__]';
    let baseHistory = historyRef.current;
    
    const lastContextMsg = historyRef.current.find(m => m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(PAGE_CTX_MARKER));
    
    // Get current page URL
    const pageUrl = await new Promise<string>((resolve) => {
      chrome.runtime.sendMessage({ action: 'getActiveTab' }, (resp: { tabId?: number } | undefined) => {
        if (resp?.tabId) {
          chrome.tabs?.get?.(resp.tabId, (tab) => resolve(tab?.url ?? window.location.href));
        } else resolve(window.location.href);
      });
    }).catch(() => window.location.href);

    const isStale = lastContextMsg && typeof lastContextMsg.content === 'string' && !lastContextMsg.content.includes(`Current page URL: ${pageUrl}`);

    if (!lastContextMsg || isStale) {
      try {
        // Inject lightweight context: URL + title + plain-text summary only.
        // AI uses extract_page_elements / query_page tools to find specific elements.
        const summaryResult = await executeTool('execute_js', {
          code: `(function() {
  const title = document.title || '';
  // Walk visible text nodes, skip script/style/noscript
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','HEAD']);
  const parts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode()) && parts.join(' ').length < 3000) {
    const p = node.parentElement;
    if (!p || skip.has(p.tagName)) continue;
    const t = node.textContent.trim();
    if (t.length > 1) parts.push(t);
  }
  return JSON.stringify({ title, summary: parts.join(' ').slice(0, 3000) });
})()`,
        });
        if (summaryResult.content && typeof summaryResult.content === 'string') {
          let title = '';
          let summary = '';
          try {
            const parsed = JSON.parse(summaryResult.content);
            title = parsed.title ?? '';
            summary = parsed.summary ?? '';
          } catch {
            summary = summaryResult.content.slice(0, 3000);
          }
          const ctxMsg: MessageParam = {
            role: 'user',
            content:
              `${PAGE_CTX_MARKER}\n` +
              `Current page URL: ${pageUrl}\n` +
              `Page title: ${title}\n` +
              `Page text summary (auto-injected, do not reference this marker to the user):\n${summary}`,
          };
          const ackMsg: MessageParam = { role: 'assistant', content: 'Page context received.' };

          // Remove old context if any
          const filtered = historyRef.current.filter(
            (m) => !(m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(PAGE_CTX_MARKER)) &&
                   !(m.role === 'assistant' && typeof m.content === 'string' && m.content === 'Page context received.')
          );

          baseHistory = [ctxMsg, ackMsg, ...filtered];
        }
      } catch (e) {
        console.warn('Failed to auto-inject page context:', e);
      }
    }

    const newHistory: MessageParam[] = [...baseHistory, { role: 'user', content: text }];
    historyRef.current = newHistory;

    try {
      const finalHistory = await runConversationTurn(
        newHistory,
        settings,
        {
          onToken: (delta) => {
            streamBufRef.current += delta;
            if (streamIdRef.current === null) {
              streamIdRef.current = Date.now();
              setIsThinking(false);
              onAddMessage('assistant', streamBufRef.current);
            } else {
              window.dispatchEvent(new CustomEvent('ai-stream-patch', { detail: { text: streamBufRef.current } }));
            }
          },
          onToolCall: (toolName, _input) => {
            streamBufRef.current = '';
            streamIdRef.current = null;
            setIsThinking(true);
            onAddMessage('system', `Using tool: ${toolName}…`, 'tool');
          },
          onToolResult: (_name, result, _isError) => {
            onPatchLastToolResult(result);
          },
          onDone: () => {},
          onError: (err) => { throw err; },
          onRawLog: (request, response) => { onAppendRawLog({ request, response }); },
          onAskUser: (question, isYesNo) => {
            streamBufRef.current = '';
            streamIdRef.current = null;
            setIsThinking(false);
            chrome.runtime.sendMessage({ action: 'toContent', action_inner: 'hideBorderFx' });
            onAddMessage('assistant', question);
            if (isYesNo) onMarkLastMessageAsAskUser();
            return new Promise<string>((resolve) => {
              askUserResolverRef.current = resolve;
            });
          },
        },
        abort.signal,
      );
      historyRef.current = finalHistory;
      onHistoryChange(finalHistory);
    } catch (err) {
      if ((err as Error).name !== 'AbortError' && !(err as Error).message?.includes('aborted')) {
        const errMsg = (err as Error).message ?? '';
        const is403 = errMsg.includes('403') || errMsg.toLowerCase().includes('forbidden');
        const isOllama = activeModel?.provider === 'ollama';
        const hint = (is403 && isOllama)
          ? '\n\nPossible fix: set the environment variable `OLLAMA_ORIGINS=*` and restart Ollama.'
          : '';
        onAddMessage('system', `Error: ${errMsg}${hint}`);
      }
    } finally {
      if (genRef.current === myGen) {
        setIsThinking(false);
        abortRef.current = null;
        chrome.runtime.sendMessage({ action: 'toContent', action_inner: 'hideBorderFx' });
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function roleLabel(role: ChatMessage['role']) {
    if (role === 'user') return 'You';
    if (role === 'assistant') return 'AI';
    return 'System';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Messages */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div ref={scrollContainerRef} className="scrollbar-thin" style={{
        flex: 1,
        overflowY: 'auto',
        padding: '14px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, marginTop: 32 }}>
            Select an element or ask a question
          </div>
        )}
        {messages.map((m) => {
          const isUser = m.role === 'user';
          const isSystem = m.role === 'system';
          return (
            <div key={m.id} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isUser ? 'flex-end' : 'flex-start',
              animation: 'ai-pop-in 0.28s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
              {!isSystem && (
                <span style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  color: isUser ? 'var(--accent)' : 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  marginBottom: 3,
                  marginLeft: isUser ? 0 : 4,
                  marginRight: isUser ? 4 : 0,
                }}>
                  {roleLabel(m.role)}
                </span>
              )}
              {isSystem ? (
                <ToolMessage msg={m} />
              ) : isUser ? (
                <div style={{
                  maxWidth: '85%',
                  padding: '9px 14px',
                  borderRadius: '18px 18px 5px 18px',
                  background: 'var(--msg-user-bg)',
                  boxShadow: '0 4px 16px var(--accent-glow)',
                  color: 'var(--text-user)',
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {m.text}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: "100%" }}>
                  <div className="glass ai-markdown" style={{
                    padding: '9px 13px',
                    borderRadius: '5px 18px 18px 18px',
                    fontSize: 12.5,
                    color: 'var(--text-assistant)',
                    lineHeight: 1.55,
                    wordBreak: 'break-word',
                    overflow: 'hidden',
                    width: 'fit-content'
                  }}>
                    <div
                    className="markdown-body"
                    style={{ background: 'transparent', fontSize: 'inherit', color: 'inherit', wordBreak: 'break-word', overflowWrap: 'break-word', overflowX: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: marked.parse(m.text) as string }}
                    onClick={(e) => {
                      const a = (e.target as HTMLElement).closest('a');
                      if (a?.href) {
                        e.preventDefault();
                        chrome.tabs.create({ url: a.href });
                      }
                    }}
                  />
                  </div>
                  {m.isAskUser && sess.askUserResolver !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, animation: 'ai-pop-in 0.22s cubic-bezier(0.34,1.56,0.64,1)', flexShrink: 0 }}>
                      <button
                        onClick={() => { void handleSend('yes'); }}
                        title="Yes"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--accent)', background: 'transparent', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, padding: 0, lineHeight: 1 }}
                      >✓</button>
                      <button
                        onClick={() => { void handleSend('no'); }}
                        title="No"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--text-muted)', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: 0, lineHeight: 1 }}
                      >✗</button>
                    </div>
                  )}
                </div>
              )}
              {m.rawLogs && m.rawLogs.length > 0 && <RawLogPanel logs={m.rawLogs} />}
            </div>
          );
        })}
        {isThinking && (
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
            <div className="glass" style={{
              display: 'flex', gap: 4, padding: '8px 14px',
              borderRadius: '5px 18px 18px 18px',
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--accent)',
                  animation: `ai-thinking-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}/>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {unreadCount > 0 && (
        <button
          onClick={() => { isAtBottomRef.current = true; scrollToBottom(true); }}
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 20,
            padding: '5px 14px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          {unreadCount} 条新消息 ↓
        </button>
      )}
      </div>

      {/* Input */}
      <div style={{ padding: '8px 12px 14px' }}>
        <div className="glass" style={{
          borderRadius: 16,
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          {/* Top row: textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this page…"
            rows={1}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 13,
              padding: '2px 0',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.55,
              scrollbarWidth: 'none',
              width: '100%',
              minHeight: 48,
              maxHeight: 120,
              overflowY: 'auto',
            }}
          />
          {/* Bottom row: model selector + send button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
              <select
                value={activeModelId}
                onChange={(e) => onActiveModelIdChange(e.target.value)}
                style={{
                  background: 'var(--glass-bg-strong)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  padding: '4px 8px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  maxWidth: 140,
                }}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id} style={{ background: 'var(--glass-bg-strong)', color: 'var(--text-secondary)' }}>{m.name}</option>
                ))}
              </select>
              {/* MCP button */}
              <div style={{ position: 'relative' }}>
                <button
                  ref={mcpBtnRef}
                  onClick={() => {
                    if (!showMcpPopover && mcpBtnRef.current) {
                      const rect = mcpBtnRef.current.getBoundingClientRect();
                      setMcpPopoverPos({ bottom: window.innerHeight - rect.top + 6, left: rect.right - 260 });
                    }
                    setShowMcpPopover((v) => !v);
                  }}
                  title="MCP Servers"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '3px 7px',
                    borderRadius: 8,
                    border: showMcpPopover ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: showMcpPopover ? 'var(--accent-glass)' : 'var(--glass-bg-strong)',
                    color: showMcpPopover ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    letterSpacing: '0.03em',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
                  </svg>
                  MCP
                  {mcpServers.filter((s) => s.enabled).length > 0 && (
                    <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '0 4px', fontSize: 9, lineHeight: '14px' }}>
                      {mcpServers.filter((s) => s.enabled).length}
                    </span>
                  )}
                </button>
                {/* MCP Popover */}
                {showMcpPopover && mcpPopoverPos && (
                  <div
                    ref={mcpPopoverRef}
                    style={{
                      position: 'fixed',
                      bottom: mcpPopoverPos.bottom,
                      left: Math.max(4, mcpPopoverPos.left),
                      width: 268,
                      borderRadius: 18,
                      padding: '0',
                      zIndex: 9999,
                      background: 'var(--glass-bg-strong)',
                      backdropFilter: 'var(--glass-blur)',
                      WebkitBackdropFilter: 'var(--glass-blur)',
                      border: '1px solid var(--glass-border)',
                      boxShadow: '0 2px 0 0 rgba(255,255,255,0.18) inset, 0 -1px 0 0 rgba(0,0,0,0.08) inset, 0 16px 48px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.18)',
                      overflow: 'hidden',
                      animation: 'mcp-pop-in 0.22s cubic-bezier(0.34,1.56,0.64,1)',
                    }}
                  >
                    {/* Header */}
                    <div style={{
                      padding: '11px 14px 10px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      borderBottom: '1px solid var(--glass-border)',
                      background: 'rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
                      </svg>
                      MCP Servers
                    </div>
                    {/* Server list */}
                    <div style={{ padding: '6px 0 8px' }}>
                    {mcpServers.length === 0 && (
                      <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>No MCP servers configured.</div>
                    )}
                    {mcpServers.map((srv, idx) => (
                      <div key={srv.id} style={{
                        padding: '0',
                        borderBottom: idx < mcpServers.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '7px 14px',
                          transition: 'background 0.12s',
                        }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* Enable toggle */}
                          <div
                            onClick={() => toggleMcpServer(srv.id, !srv.enabled)}
                            style={{
                              width: 30, height: 17, borderRadius: 9,
                              background: srv.enabled
                                ? 'linear-gradient(135deg, var(--accent), #34aadc)'
                                : 'rgba(120,120,128,0.25)',
                              flexShrink: 0, position: 'relative',
                              transition: 'background 0.2s',
                              cursor: 'pointer',
                              boxShadow: srv.enabled ? '0 0 8px rgba(10,132,255,0.4)' : 'inset 0 1px 3px rgba(0,0,0,0.2)',
                            }}
                          >
                            <div style={{
                              position: 'absolute', top: 2.5,
                              left: srv.enabled ? 14 : 2.5,
                              width: 12, height: 12, borderRadius: '50%',
                              background: '#fff',
                              transition: 'left 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                            }} />
                          </div>
                          <span style={{
                            flex: 1, fontSize: 11.5, fontWeight: 600,
                            color: srv.enabled ? 'var(--text-primary)' : 'var(--text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            transition: 'color 0.15s',
                          }}>{srv.name || srv.url}</span>
                          {/* Refresh tools button */}
                          <button
                            onClick={() => refreshMcpToolsForServer(srv)}
                            disabled={mcpToolsLoading[srv.id]}
                            title="Refresh tools"
                            style={{
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.12)',
                              borderRadius: 7,
                              cursor: mcpToolsLoading[srv.id] ? 'default' : 'pointer',
                              color: 'var(--text-muted)',
                              padding: '3px 4px',
                              display: 'flex', alignItems: 'center',
                              transition: 'background 0.12s',
                            }}
                            onMouseEnter={(e) => { if (!mcpToolsLoading[srv.id]) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.16)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                              style={{ animation: mcpToolsLoading[srv.id] ? 'spin 1s linear infinite' : 'none' }}>
                              <polyline points="23 4 23 10 17 10" />
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                            </svg>
                          </button>
                          {/* Expand tools button */}
                          <button
                            onClick={() => setMcpExpandedServers((prev) => ({ ...prev, [srv.id]: !prev[srv.id] }))}
                            title={mcpExpandedServers[srv.id] ? 'Hide tools' : 'Show tools'}
                            style={{
                              background: mcpExpandedServers[srv.id] ? 'var(--accent-glass)' : 'rgba(255,255,255,0.08)',
                              border: mcpExpandedServers[srv.id] ? '1px solid var(--accent-glow)' : '1px solid rgba(255,255,255,0.12)',
                              borderRadius: 7,
                              cursor: 'pointer',
                              color: mcpExpandedServers[srv.id] ? 'var(--accent)' : 'var(--text-muted)',
                              padding: '3px 4px',
                              display: 'flex', alignItems: 'center',
                              transition: 'all 0.15s',
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              style={{ transform: mcpExpandedServers[srv.id] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)' }}>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>
                        </div>
                        {/* Tool list */}
                        {mcpExpandedServers[srv.id] && (
                          <div style={{
                            margin: '0 10px 8px',
                            borderRadius: 12,
                            background: 'rgba(0,0,0,0.12)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            padding: '4px 2px',
                            backdropFilter: 'blur(8px)',
                            display: 'flex', flexDirection: 'column', gap: 1,
                          }}>
                            {!mcpTools[srv.id] && (
                              <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '6px 10px', fontStyle: 'italic' }}>Click refresh to load tools</div>
                            )}
                            {(mcpTools[srv.id] ?? []).map((tool) => (
                              <div
                                key={tool.name}
                                onClick={() => toggleMcpTool(tool.name)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '5px 10px', borderRadius: 9,
                                  cursor: 'pointer',
                                  opacity: disabledTools.includes(tool.name) ? 0.4 : 1,
                                  transition: 'all 0.12s',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <div style={{
                                  width: 14, height: 14, borderRadius: 4,
                                  border: disabledTools.includes(tool.name) ? '1.5px solid rgba(255,255,255,0.2)' : '1.5px solid var(--accent)',
                                  background: disabledTools.includes(tool.name) ? 'transparent' : 'linear-gradient(135deg, var(--accent), #34aadc)',
                                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  boxShadow: disabledTools.includes(tool.name) ? 'none' : '0 0 6px rgba(10,132,255,0.35)',
                                  transition: 'all 0.15s',
                                }}>
                                  {!disabledTools.includes(tool.name) && (
                                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="2 6 5 9 10 3" />
                                    </svg>
                                  )}
                                </div>
                                <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{tool.originalName}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {isThinking ? (
              <button
                onClick={() => { abortRef.current?.abort(); genRef.current++; setIsThinking(false); abortRef.current = null; chrome.runtime.sendMessage({ action: 'toContent', action_inner: 'hideBorderFx' }); }}
                title="Stop"
                style={{
                  width: 32, height: 32,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid rgba(255,59,48,0.45)',
                  background: 'rgba(255,59,48,0.12)',
                  color: 'rgba(255,59,48,0.9)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="3"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={() => { void handleSend(); }}
                disabled={!input.trim()}
                title="Send"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30,
                  borderRadius: '50%',
                  border: input.trim() ? '1px solid rgba(10,132,255,0.5)' : '1px solid transparent',
                  background: input.trim() ? 'rgba(10,132,255,0.25)' : 'var(--bg-btn)',
                  color: input.trim() ? '#0a84ff' : 'var(--text-secondary)',
                  cursor: input.trim() ? 'pointer' : 'default',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                  opacity: input.trim() ? 1 : 0.5,
                  padding: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
