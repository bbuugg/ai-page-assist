import { useState, useRef, useEffect, useCallback, useLayoutEffect, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
import { type ModelConfig, type McpServerConfig } from '../../lib/storage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { fetchMcpTools, type McpTool } from '../../lib/mcp';

interface Props {
  sessionId: string;
  messages: ChatMessage[];
  onAddMessage: (role: ChatMessage['role'], text: string, toolMeta?: string) => void;
  onPatchLastToolResult: (result: string, isError?: boolean) => void;
  onRemoveLastStreamingMessage: () => void;
  onMarkLastMessageAsAskUser: () => void;
  onAppendRawLog: (log: { request: string; response: string }) => void;
  elementData: { html: string; css: string } | null;
  history: MessageParam[];
  onHistoryChange: (history: MessageParam[]) => void;
  models: ModelConfig[];
  activeModelId: string;
  onActiveModelIdChange: (id: string) => void;
  aiTabs: { id: number; title: string; url: string }[];
  onCloseAiTab: (tabId: number) => void;
  onCloseAllAiTabs: () => void;
}

const RawLogPanel = memo(function RawLogPanel({ logs }: { logs: { request: string; response: string }[] }) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('request');
  const [copied, setCopied] = useState(false);

  const currentContent = logs[activeIdx]?.[activeTab] ?? '';

  function handleCopy() {
    navigator.clipboard.writeText(currentContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-[92%] mt-0.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground px-1 py-0.5 cursor-pointer bg-transparent border-none"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
        原始日志 ({logs.length})
      </button>
      {open && (
        <div className="rounded-lg bg-muted p-2 text-[10.5px] mt-0.5">
          {logs.length > 1 && (
            <div className="flex gap-1 mb-1.5">
              {logs.map((_, i) => (
                <Button key={i} variant={activeIdx === i ? 'secondary' : 'ghost'} size="sm" className="h-5 text-[10px] px-2" onClick={() => setActiveIdx(i)}>轮次 {i + 1}</Button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 mb-1.5">
            <div className="flex gap-1">
              {(['request', 'response'] as const).map((t) => (
                <Button key={t} variant={activeTab === t ? 'secondary' : 'ghost'} size="sm" className="h-5 text-[10px] px-2" onClick={() => setActiveTab(t)}>{t === 'request' ? '请求' : '响应'}</Button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] px-2 ml-auto gap-1"
              onClick={handleCopy}
            >
              {copied ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <pre className="m-0 whitespace-pre-wrap break-all text-muted-foreground max-h-64 overflow-y-auto leading-snug">{currentContent}</pre>
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
      <span className="text-[11px] text-muted-foreground leading-relaxed px-2.5 py-1 bg-muted rounded-lg italic whitespace-pre-wrap break-all">
        {msg.text}
      </span>
    );
  }
  return (
    <div className={cn('text-[11px] rounded-lg overflow-hidden max-w-[92%]', msg.toolIsError ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full bg-transparent border-none cursor-pointer px-2.5 py-1 italic text-[11px] text-left font-[inherit]"
        style={{ color: 'inherit' }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {msg.toolIsError ? '⚠ ' : ''}{msg.text}
      </button>
      {open && msg.toolResult && (
        <div className={cn('px-2.5 pb-2 border-t', msg.toolIsError ? 'border-destructive/30' : 'border-border')}>
          <pre className="m-0 text-[10px] whitespace-pre-wrap break-all max-h-48 overflow-y-auto leading-snug" style={{ color: 'inherit' }}>{msg.toolResult}</pre>
        </div>
      )}
      {open && !msg.toolResult && (
        <div className="px-2.5 pb-2 border-t border-border text-muted-foreground italic text-[10px]">waiting…</div>
      )}
    </div>
  );
});

export default function ChatPanel({ sessionId, messages, onAddMessage, onPatchLastToolResult, onRemoveLastStreamingMessage, onMarkLastMessageAsAskUser, onAppendRawLog, elementData, history, onHistoryChange, models, activeModelId, onActiveModelIdChange, aiTabs, onCloseAiTab, onCloseAllAiTabs }: Props) {
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
  const mcpBtnRef = useRef<HTMLDivElement>(null);
  const mcpServers = useChatStore((s) => s.mcpServers);
  const disabledTools = useChatStore((s) => s.disabledTools);
  const [mcpTools, setMcpTools] = useState<Record<string, McpTool[]>>({});
  const [mcpToolsLoading, setMcpToolsLoading] = useState<Record<string, boolean>>({});
  const [mcpExpandedServers, setMcpExpandedServers] = useState<Record<string, boolean>>({});
  const mcpPopoverRef = useRef<HTMLDivElement>(null);
  const autosizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const maxHeight = 120;
    el.style.height = '0px';
    const nextHeight = Math.max(48, Math.min(el.scrollHeight, maxHeight));
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
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
    return () => {
      const store = useChatStore.getState();
      store.getSession(sessionId).abortController?.abort();
      store.resetSession(sessionId);
      chrome.runtime.sendMessage({ action: 'toContent', action_inner: 'destroyFx' });
    };
  }, [sessionId]);

  useEffect(() => {
    chrome.runtime.sendMessage({
      action: 'toContent',
      action_inner: isThinking ? 'showBorderFx' : 'hideBorderFx',
    });
  }, [isThinking]);

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
    useChatStore.getState().setMcpServers(mcpServers.map((s) => s.id === id ? { ...s, enabled } : s));
  }

  function toggleMcpTool(toolName: string) {
    const next = disabledTools.includes(toolName)
      ? disabledTools.filter((t) => t !== toolName)
      : [...disabledTools, toolName];
    useChatStore.getState().setDisabledTools(next);
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

  useLayoutEffect(() => {
    autosizeTextarea();
  }, [autosizeTextarea, input, sessionId]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => autosizeTextarea());
    const timeoutId = window.setTimeout(() => autosizeTextarea(), 60);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [autosizeTextarea, sessionId]);

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
    isAtBottomRef.current = true;

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

    // Inject current page context into every user turn automatically
    const pageCtx = await new Promise<string>((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'toContent', action_inner: 'tool', tool: 'get_page_context', input: {} },
        (res: { result?: string; error?: string } | undefined) => {
          if (chrome.runtime.lastError) { resolve(''); return; }
          if (res?.error) {
            // Internal browser page or inaccessible tab
            resolve(`[Page context unavailable: ${res.error}]`);
          } else {
            resolve(res?.result ?? '');
          }
        }
      );
      setTimeout(() => resolve(''), 3000);
    });
    const userContent = pageCtx ? `[Page context]\n${pageCtx}\n\n[User message]\n${text}` : text;
    const newHistory: MessageParam[] = [...historyRef.current, { role: 'user', content: userContent }];
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
          onToolResult: (_name, result, isError) => {
            onPatchLastToolResult(result, isError);
          },
          onDone: () => {},
          onError: (err) => { throw err; },
          onRawLog: (request, response) => { onAppendRawLog({ request, response }); },
          onAskUser: (question, isYesNo) => {
            streamBufRef.current = '';
            streamIdRef.current = null;
            setIsThinking(false);
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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Messages */}
      <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-3.5 flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-xs mt-8">
            Ask a question or give a task
          </div>
        )}
        {messages.filter((m) => m.role !== 'assistant' || m.text.trim() !== '').map((m) => {
          const isUser = m.role === 'user';
          const isSystem = m.role === 'system';
          return (
            <div key={m.id} className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')} style={{ animation: 'ai-pop-in 0.28s cubic-bezier(0.34,1.56,0.64,1)' }}>
              {!isSystem && (
                <span className={cn('text-[9.5px] font-semibold uppercase tracking-widest mb-0.5', isUser ? 'mr-1 text-primary' : 'ml-1 text-muted-foreground')}>
                  {roleLabel(m.role)}
                </span>
              )}
              {isSystem ? (
                <ToolMessage msg={m} />
              ) : isUser ? (
                <div className="max-w-[85%] px-3.5 py-2 rounded-[18px_18px_5px_18px] bg-primary text-primary-foreground text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">
                  {m.text}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-w-full">
                  <div className="ai-markdown px-3 py-2 rounded-[5px_18px_18px_18px] bg-muted text-[12.5px] leading-relaxed break-words overflow-hidden">
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
                    <div className="flex flex-row gap-1.5 flex-end" style={{ animation: 'ai-pop-in 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}>
                      <Button variant="outline" size="icon" className="h-6 w-6 rounded-full" onClick={() => { void handleSend('no'); }} title="取消">✕</Button>
                      <Button size="icon" className="h-6 w-6 rounded-full" onClick={() => { void handleSend('yes'); }} title="确认">✓</Button>
                    </div>
                  )}
                </div>
              )}
              {m.rawLogs && m.rawLogs.length > 0 && <RawLogPanel logs={m.rawLogs} />}
            </div>
          );
        })}
        {isThinking && (
          <div className="flex items-center pl-1">
            <div className="flex gap-1 px-3.5 py-2 rounded-[5px_18px_18px_18px] bg-muted">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-foreground" style={{ animation: `ai-thinking-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}/>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {unreadCount > 0 && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { isAtBottomRef.current = true; scrollToBottom(true); }}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap z-10 shadow-md"
        >
          {unreadCount} 条新消息 ↓
        </Button>
      )}
      </div>

      {aiTabs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-t border-border bg-muted shrink-0">
          {aiTabs.map((tab) => (
            <div key={tab.id} className="flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full border border-border bg-background max-w-[180px] text-[11px] text-foreground">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[130px]">
                {tab.title || tab.url || `Tab ${tab.id}`}
              </span>
              <button
                onClick={() => onCloseAiTab(tab.id)}
                title="Close tab"
                className="shrink-0 text-muted-foreground hover:text-foreground p-0 leading-none flex items-center"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
                </svg>
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={onCloseAllAiTabs}
            title="Close all AI tabs"
            className="ml-auto text-[10px] h-5 px-2 text-muted-foreground"
          >
            全部关闭
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3.5 pt-2">
        <div className="border border-border rounded-2xl px-3 py-2 flex flex-col gap-1.5 bg-background">
          {/* Top row: textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="询问关于此页面的问题…"
            rows={1}
            style={{
              background: 'transparent',
              border: 'none',
              boxSizing: 'border-box',
              fontSize: 13,
              height: 48,
              padding: '2px 0',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.55,
              scrollbarWidth: 'none',
              width: '100%',
              minHeight: 48,
              maxHeight: 120,
              overflowY: 'hidden',
              color: 'inherit',
            }}
          />
          {/* Bottom row: model selector + send button */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Select value={activeModelId} onValueChange={onActiveModelIdChange}>
                <SelectTrigger className="max-w-[140px] h-6 text-[11px] text-muted-foreground rounded-lg px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* MCP button */}
              <div className="relative" ref={mcpBtnRef}>
                <Button
                  variant={showMcpPopover ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (!showMcpPopover && mcpBtnRef.current) {
                      const rect = mcpBtnRef.current.getBoundingClientRect();
                      setMcpPopoverPos({ bottom: window.innerHeight - rect.top + 6, left: rect.right - 260 });
                    }
                    setShowMcpPopover((v) => !v);
                  }}
                  title="MCP Servers"
                  className={cn('h-6 text-[10px] font-semibold gap-1 px-2', showMcpPopover && 'text-primary')}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
                  </svg>
                  MCP
                  {mcpServers.filter((s) => s.enabled).length > 0 && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">
                      {mcpServers.filter((s) => s.enabled).length}
                    </Badge>
                  )}
                </Button>
                {/* MCP Popover */}
                {showMcpPopover && mcpPopoverPos && (
                  <div
                    ref={mcpPopoverRef}
                    className="fixed z-[9999] w-[268px] rounded-xl border border-border bg-popover shadow-lg overflow-hidden"
                    style={{ bottom: mcpPopoverPos.bottom, left: Math.max(4, mcpPopoverPos.left) }}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-border bg-muted/50 text-[10.5px] font-bold text-muted-foreground uppercase tracking-widest">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
                      </svg>
                      MCP 服务器
                    </div>
                    {/* Server list */}
                    <div className="py-1.5">
                      {mcpServers.length === 0 && (
                        <div className="px-3.5 py-2.5 text-[11px] text-muted-foreground italic">未配置 MCP 服务器。</div>
                      )}
                      {mcpServers.map((srv, idx) => (
                        <div key={srv.id} className={cn(idx < mcpServers.length - 1 && 'border-b border-border')}>
                          <div className="flex items-center gap-2 px-3.5 py-1.5 hover:bg-muted/50">
                            <Switch
                              checked={srv.enabled}
                              onCheckedChange={(v) => toggleMcpServer(srv.id, v)}
                              className="scale-75 shrink-0"
                            />
                            <span className={cn('flex-1 text-[11.5px] font-semibold overflow-hidden text-ellipsis whitespace-nowrap', srv.enabled ? 'text-foreground' : 'text-muted-foreground')}>{srv.name || srv.url}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => refreshMcpToolsForServer(srv)}
                              disabled={mcpToolsLoading[srv.id]}
                              title="Refresh tools"
                              className="h-5 w-5 shrink-0"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ animation: mcpToolsLoading[srv.id] ? 'spin 1s linear infinite' : 'none' }}>
                                <polyline points="23 4 23 10 17 10" />
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                              </svg>
                            </Button>
                            <Button
                              variant={mcpExpandedServers[srv.id] ? 'secondary' : 'ghost'}
                              size="icon"
                              onClick={() => setMcpExpandedServers((prev) => ({ ...prev, [srv.id]: !prev[srv.id] }))}
                              title={mcpExpandedServers[srv.id] ? 'Hide tools' : 'Show tools'}
                              className="h-5 w-5 shrink-0"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                style={{ transform: mcpExpandedServers[srv.id] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }}>
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </Button>
                          </div>
                          {/* Tool list */}
                          {mcpExpandedServers[srv.id] && (
                            <div className="mx-2.5 mb-2 rounded-lg border border-border bg-muted/50 flex flex-col">
                              {!mcpTools[srv.id] && (
                                <div className="text-[10px] text-muted-foreground px-2.5 py-1.5 italic">Click refresh to load tools</div>
                              )}
                              {(mcpTools[srv.id] ?? []).map((tool) => (
                                <div
                                  key={tool.name}
                                  onClick={() => toggleMcpTool(tool.name)}
                                  className={cn('flex items-center gap-2 px-2.5 py-1 rounded cursor-pointer hover:bg-muted', disabledTools.includes(tool.name) && 'opacity-40')}
                                >
                                  <div className={cn('w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center border', disabledTools.includes(tool.name) ? 'border-muted-foreground/30 bg-transparent' : 'border-primary bg-primary')}>
                                    {!disabledTools.includes(tool.name) && (
                                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="2 6 5 9 10 3" />
                                      </svg>
                                    )}
                                  </div>
                                  <span className="text-[10.5px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap flex-1">{tool.originalName}</span>
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
              <Button
                variant="destructive"
                size="icon"
                onClick={() => { abortRef.current?.abort(); genRef.current++; setIsThinking(false); abortRef.current = null; }}
                title="Stop"
                className="h-8 w-8 rounded-full shrink-0"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="3"/>
                </svg>
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => { void handleSend(); }}
                disabled={!input.trim()}
                title="Send"
                className="h-8 w-8 rounded-full shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </Button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
