import { useState, useRef, useEffect, useCallback, useLayoutEffect, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
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
import { getAllResolvedModels, resolveModel, type ProviderConfig, type McpServerConfig, type Session, savePreviewHtml } from '../../lib/storage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { fetchMcpTools, type McpTool } from '../../lib/mcp';
import { getAllAgents, buildAgentSystemPrompt, type Agent } from '../../lib/agents';
import { ALL_TOOLS } from '../../lib/tools/registry';
import { executeTool } from '../../lib/tools';
import { compressHistory } from '../../lib/ai/compress';
import { desensitize, createDesensitizer, type Desensitizer } from '../../lib/desensitize';
import { toast } from 'sonner';

interface Props {
  sessionId: string;
  messages: ChatMessage[];
  onAddMessage: (role: ChatMessage['role'], text: string, toolMeta?: string) => void;
  onPatchLastToolResult: (result: string, isError?: boolean) => void;
  onPatchLastAssistantThinking: (thinkingText: string) => void;
  onRemoveLastStreamingMessage: () => void;
  onMarkLastMessageAsAskUser: () => void;
  onAppendRawLog: (log: { request: string; response: string }) => void;
  onRecordToolCall: (name: string, input: Record<string, unknown>) => void;
  onDeleteMessage: (id: number) => void;
  sessions: Session[];
  elementData: { html: string; css: string } | null;
  history: MessageParam[];
  onHistoryChange: (history: MessageParam[]) => void;
  providers: ProviderConfig[];
  activeModelUid: string;
  onActiveModelUidChange: (uid: string) => void;
  aiTabs: { id: number; title: string; url: string }[];
  onCloseAiTab: (tabId: number) => void;
  onCloseAllAiTabs: () => void;
}

const ThinkingBlock = memo(function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', maxWidth: '100%' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '2px 0', fontSize: 11 }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
        思考过程
      </button>
      {open && (
        <div style={{ marginTop: 4, padding: '6px 8px', borderRadius: 6, background: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontStyle: 'italic', lineHeight: 1.5, maxHeight: 200, overflowY: 'auto' }}>
          {text}
        </div>
      )}
    </div>
  );
});

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
        className="flex items-center gap-1 text-[10px] text-muted-foreground px-1 py-0.5 cursor-pointer bg-transparent border-none whitespace-nowrap"
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
          <pre className="m-0 text-[10px] whitespace-pre-wrap break-all max-h-48 overflow-y-auto leading-snug" style={{ color: 'inherit' }}>{desensitize(msg.toolResult)}</pre>
        </div>
      )}
      {open && !msg.toolResult && (
        <div className="px-2.5 pb-2 border-t border-border text-muted-foreground italic text-[10px]">waiting…</div>
      )}
    </div>
  );
});

export default function ChatPanel({ sessionId, messages, onAddMessage, onPatchLastToolResult, onPatchLastAssistantThinking, onRemoveLastStreamingMessage, onMarkLastMessageAsAskUser, onAppendRawLog, onRecordToolCall, onDeleteMessage, elementData, history, onHistoryChange, providers, activeModelUid, onActiveModelUidChange, aiTabs, onCloseAiTab, onCloseAllAiTabs, sessions }: Props) {
  const allModels = getAllResolvedModels(providers);
  const store = useChatStore();
  const sess = store.getSession(sessionId);
  const input = sess.input;
  const setInput = (v: string) => store.setInput(sessionId, v);
  const isThinking = sess.isThinking;
  const isRunning = useChatStore((s) => s.getSession(sessionId).abortController !== null);
  const setIsThinking = (v: boolean) => store.setIsThinking(sessionId, v);
  const compressThreshold = useChatStore((s) => s.compressThreshold);
  const [isCompressing, setIsCompressing] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [modelSelectOpen, setModelSelectOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [copiedMsgId, setCopiedMsgId] = useState<number | null>(null);
  const historyRef = useRef<MessageParam[]>(history);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const genRef = useRef(0);
  const previewThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const lastPageCtxRef = useRef<string>('');
  const desensitizeRef = useRef<Desensitizer>(createDesensitizer());
  const prevMsgCountRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMcpPopover, setShowMcpPopover] = useState(false);
  const [mcpPopoverPos, setMcpPopoverPos] = useState<{ bottom: number; left: number } | null>(null);
  const mcpBtnRef = useRef<HTMLDivElement>(null);
  const mcpServers = useChatStore((s) => s.mcpServers);
  const disabledTools = useChatStore((s) => s.disabledTools);
  const agentDisabledTools = useChatStore((s) => s.agentDisabledTools);
  const [mcpTools, setMcpTools] = useState<Record<string, McpTool[]>>({});
  const [mcpToolsLoading, setMcpToolsLoading] = useState<Record<string, boolean>>({});
  const [mcpExpandedServers, setMcpExpandedServers] = useState<Record<string, boolean>>({});
  const mcpPopoverRef = useRef<HTMLDivElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  interface ReplayState {
    steps: { name: string; input: Record<string, unknown> }[];
    index: number;
    paused: boolean;
    total: number;
  }
  const [replayState, setReplayState] = useState<ReplayState | null>(null);
  const replayPausedRef = useRef(false);
  const replayAbortRef = useRef(false);
  const [showReplayPicker, setShowReplayPicker] = useState(false);
  const replayPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const SLASH_COMMANDS = [
    { name: '/compress', description: '调用 AI 压缩当前对话上下文' },
    { name: '/clear', description: '清空对话上下文' },
    { name: '/export', description: '导出工具调用记录，参数: json 或 js' },
    { name: '/replay', description: '回放历史会话或导入 JSON 文件的工具操作' },
  ];
  const customAgents = useChatStore((s) => s.customAgents);
  const activeAgentId = store.getSession(sessionId).activeAgentId;
  const allAgents = getAllAgents(customAgents);
  const activeAgent = allAgents.find((s) => s.id === activeAgentId) ?? null;
  const mentionAgents = mentionQuery !== null
    ? allAgents.filter((s) => s.name.includes(mentionQuery) || s.label.toLowerCase().includes(mentionQuery))
    : [];
  const filteredSlashCommands = slashQuery !== null
    ? SLASH_COMMANDS.filter((c) => {
        const cmdName = c.name.slice(1);
        return cmdName.startsWith(slashQuery) || slashQuery.startsWith(cmdName);
      })
    : [];
  const autosizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const maxHeight = 120;
    el.style.height = '0px';
    const nextHeight = Math.max(48, Math.min(el.scrollHeight, maxHeight));
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  function selectMention(agent: Agent) {
    const atIdx = input.lastIndexOf('@');
    setInput(atIdx >= 0 ? input.slice(0, atIdx) : input);
    setMentionQuery(null);
    store.setActiveAgentId(sessionId, agent.id);
  }

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
      action_inner: isRunning ? 'showBorderFx' : 'hideBorderFx',
    });
  }, [isRunning]);

  async function refreshMcpToolsForServer(srv: McpServerConfig) {
    setMcpToolsLoading((prev) => ({ ...prev, [srv.id]: true }));
    try {
      const tools = await fetchMcpTools(srv);
      setMcpTools((prev) => ({ ...prev, [srv.id]: tools }));
      setMcpExpandedServers((prev) => ({ ...prev, [srv.id]: true }));
      toast.success(`已加载 ${tools.length} 个工具`);
    } catch (e) {
      toast.error(`加载工具失败`);
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

  // On session change, jump to bottom instantly (no animation)
  useEffect(() => {
    prevMsgCountRef.current = messages.length;
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    setUnreadCount(0);
  }, [sessionId]);

  useEffect(() => {
    const newMsgAdded = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (newMsgAdded) scrollToBottom();
    else if (isAtBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Inject "发送到预览" buttons on HTML code blocks after render
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.querySelectorAll('pre code.language-html').forEach((codeEl) => {
      const pre = codeEl.parentElement as HTMLPreElement;
      if (pre.querySelector('.preview-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'preview-btn';
      btn.title = '发送到预览';
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      btn.style.cssText = 'position:absolute;bottom:8px;right:8px;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:5px;border:1px solid var(--border);background:var(--muted);color:var(--foreground);cursor:pointer;opacity:0.75;z-index:1;padding:0';
      btn.addEventListener('click', () => {
        const code = (codeEl as HTMLElement).innerText;
        void savePreviewHtml(code).then(() => {
          chrome.tabs.query({ url: chrome.runtime.getURL('preview.html') }, (tabs) => {
            if (tabs.length > 0) {
              chrome.tabs.update(tabs[0].id!, { active: true });
            } else {
              chrome.tabs.create({ url: chrome.runtime.getURL('preview.html') });
            }
          });
        });
      });
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
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
    desensitizeRef.current = createDesensitizer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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

  async function handleCompress() {
    const activeModel = resolveModel(providers, activeModelUid) ?? allModels[0];
    if (!activeModel) { onAddMessage('system', 'No model configured.'); return; }
    setIsCompressing(true);
    onAddMessage('system', '正在压缩上下文…');
    try {
      const compressed = await compressHistory(historyRef.current, activeModel);
      historyRef.current = compressed;
      onHistoryChange(compressed);
      onAddMessage('system', `上下文已压缩（${historyRef.current.length} 条消息）`);
    } catch (e) {
      onAddMessage('system', `压缩失败：${(e as Error).message}`);
    } finally {
      setIsCompressing(false);
    }
  }

  function exportSession(format: 'json' | 'js') {
    const steps = messages
      .filter((m) => m.toolMeta === 'tool' && m.toolCall && !m.toolIsError)
      .map((m) => m.toolCall!);
    if (steps.length === 0) {
      onAddMessage('system', '当前会话没有可导出的工具调用记录。');
      return;
    }
    const sessionTitle = messages.find((m) => m.role === 'user')?.text.slice(0, 32) ?? 'session';
    const safeName = sessionTitle.replace(/[^\w\u4e00-\u9fa5]/g, '-').slice(0, 32);
    let content: string;
    let filename: string;
    let mime: string;
    if (format === 'json') {
      content = JSON.stringify(steps, null, 2);
      filename = `replay-${safeName}.json`;
      mime = 'application/json';
    } else {
      const lines = [
        `// AI Page Inspector — Replay Script`,
        `// Generated: ${new Date().toISOString()}`,
        `// Steps: ${steps.length}`,
        ``,
        `const steps = ${JSON.stringify(steps, null, 2)};`,
        ``,
        `async function replay() {`,
        `  for (let i = 0; i < steps.length; i++) {`,
        `    const { name, input } = steps[i];`,
        `    console.log('[replay] step', i + 1, '/', steps.length, name, input);`,
        `    await new Promise((resolve) => {`,
        `      chrome.runtime.sendMessage(`,
        `        { action: 'toContent', action_inner: 'tool', tool: name, input },`,
        `        () => setTimeout(resolve, 300)`,
        `      );`,
        `    });`,
        `  }`,
        `  console.log('[replay] done');`,
        `}`,
        ``,
        `replay();`,
      ];
      content = lines.join('\n');
      filename = `replay-${safeName}.js`;
      mime = 'text/javascript';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onAddMessage('system', `已导出 ${steps.length} 个步骤到 ${filename}`);
  }

  async function runReplay(steps: { name: string; input: Record<string, unknown> }[]) {
    if (steps.length === 0) { onAddMessage('system', '没有可回放的步骤。'); return; }
    replayPausedRef.current = false;
    replayAbortRef.current = false;
    setReplayState({ steps, index: 0, paused: false, total: steps.length });
    onAddMessage('system', `开始回放，共 ${steps.length} 个步骤…`);
    for (let i = 0; i < steps.length; i++) {
      if (replayAbortRef.current) break;
      while (replayPausedRef.current) {
        await new Promise((r) => setTimeout(r, 200));
        if (replayAbortRef.current) break;
      }
      if (replayAbortRef.current) break;
      const { name, input } = steps[i];
      setReplayState((prev) => prev ? { ...prev, index: i } : null);
      onAddMessage('system', `[${i + 1}/${steps.length}] ${name}`, 'tool');
      try {
        const result = await executeTool(name, input);
        onPatchLastToolResult(result.content, result.isError);
      } catch (e) {
        onPatchLastToolResult(String(e), true);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!replayAbortRef.current) onAddMessage('system', '回放完成。');
    setReplayState(null);
  }

  async function handleSend(override?: string) {
    const text = (override ?? input).trim();
    if (!text) return;
    isAtBottomRef.current = true;

    // Handle slash commands
    if (text === '/compress') {
      setInput('');
      await handleCompress();
      return;
    }
    if (text === '/clear') {
      setInput('');
      historyRef.current = [];
      onHistoryChange([]);
      desensitizeRef.current = createDesensitizer();
      onAddMessage('system', '上下文已清空');
      return;
    }
    if (text.startsWith('/export')) {
      const arg = text.slice('/export'.length).trim().toLowerCase();
      if (arg === 'js') {
        setInput('');
        exportSession('js');
      } else {
        setInput('');
        exportSession('json');
      }
      return;
    }
    if (text === '/replay') {
      setInput('');
      setShowReplayPicker(true);
      return;
    }

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

    const resolvedModel = resolveModel(providers, activeModelUid) ?? allModels[0];
    const activeModel = resolvedModel && resolvedModel.type === 'anthropic'
      ? { ...resolvedModel, thinking: { enabled: thinkingEnabled, budgetTokens: resolvedModel.thinking?.budgetTokens ?? 8000 } }
      : resolvedModel;
    if (!activeModel) {
      onAddMessage('system', 'No model configured. Add a provider in Settings.');
      setIsThinking(false);
      return;
    }
    if (!activeModel.apiKey && activeModel.type !== 'ollama') {
      onAddMessage('system', 'API key not set. Go to Settings and configure your provider.');
      setIsThinking(false);
      return;
    }

    // Auto-compress if threshold exceeded
    if (compressThreshold > 0 && historyRef.current.length >= compressThreshold) {
      onAddMessage('system', '正在自动压缩上下文…');
      try {
        const compressed = await compressHistory(historyRef.current, activeModel);
        historyRef.current = compressed;
        onHistoryChange(compressed);
      } catch {
        // Compression failed — continue with full history
      }
    }

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
    const ctxChanged = pageCtx && pageCtx !== lastPageCtxRef.current;
    if (ctxChanged) lastPageCtxRef.current = pageCtx;
    const userContent = ctxChanged ? `[Page context]\n${pageCtx}\n\n[User message]\n${text}` : text;
    const newHistory: MessageParam[] = [...historyRef.current, { role: 'user', content: userContent }];
    historyRef.current = newHistory;

    try {
      const extraSystemPrompt = activeAgent ? buildAgentSystemPrompt(activeAgent) : undefined;
      const allToolNames = ALL_TOOLS.map((t) => t.name);
      const ALWAYS_ENABLED = ['ask_user'];
      let extraDisabledTools: string[];
      if (!activeAgent) {
        extraDisabledTools = allToolNames.filter((n) => !ALWAYS_ENABLED.includes(n));
      } else {
        const notRecommended = allToolNames.filter((n) => !activeAgent.recommendedTools.includes(n) && !ALWAYS_ENABLED.includes(n));
        const userDisabled = agentDisabledTools[activeAgent.id] ?? [];
        extraDisabledTools = [...new Set([...notRecommended, ...userDisabled])];
      }
      const finalHistory = await runConversationTurn(
        newHistory,
        activeModel,
        {
          onToken: (delta) => {
            streamBufRef.current += delta;
            const decoded = desensitizeRef.current.decode(streamBufRef.current);
            if (streamIdRef.current === null) {
              streamIdRef.current = Date.now();
              setIsThinking(false);
              onAddMessage('assistant', decoded);
            } else {
              window.dispatchEvent(new CustomEvent('ai-stream-patch', { detail: { text: decoded } }));
            }
            // Throttle-push HTML blocks to preview page if open
            if (previewThrottleRef.current) clearTimeout(previewThrottleRef.current);
            previewThrottleRef.current = setTimeout(() => {
              const htmlMatch = streamBufRef.current.match(/```html\n([\s\S]*?)\n```/);
              if (htmlMatch) {
                chrome.tabs.query({ url: chrome.runtime.getURL('preview.html') }, (tabs) => {
                  if (tabs.length > 0) void savePreviewHtml(htmlMatch[1]);
                });
              }
            }, 500);
          },
          onToolCall: (toolName, _input) => {
            streamBufRef.current = '';
            streamIdRef.current = null;
            setIsThinking(true);
            onAddMessage('system', `Using tool: ${toolName}…`, 'tool');
            onRecordToolCall(toolName, _input);
          },
          onToolResult: (_name, result, isError) => {
            onPatchLastToolResult(result, isError);
          },
          onThinking: (thinkingText) => {
            onPatchLastAssistantThinking(thinkingText);
          },
          onDone: () => {},
          onError: (err) => { throw err; },
          onRawLog: (request, response) => { onAppendRawLog({ request, response }); },
          onAskUser: (question, isYesNo) => {
            streamBufRef.current = '';
            streamIdRef.current = null;
            setIsThinking(false);
            onAddMessage('assistant', desensitizeRef.current.decode(question));
            if (isYesNo) onMarkLastMessageAsAskUser();
            return new Promise<string>((resolve) => {
              askUserResolverRef.current = resolve;
            });
          },
        },
        abort.signal,
        extraSystemPrompt,
        extraDisabledTools,
        desensitizeRef.current,
      );
      historyRef.current = finalHistory;
      onHistoryChange(finalHistory);
    } catch (err) {
      if ((err as Error).name !== 'AbortError' && !(err as Error).message?.includes('aborted')) {
        const errMsg = (err as Error).message ?? '';
        const is403 = errMsg.includes('403') || errMsg.toLowerCase().includes('forbidden');
        const isOllama = activeModel?.type === 'ollama';
        const hint = (is403 && isOllama)
          ? '\n\nPossible fix: set the environment variable `OLLAMA_ORIGINS=*` and restart Ollama.'
          : '';
        onAddMessage('system', `Error: ${errMsg}${hint}`);
      }
    } finally {
      if (genRef.current === myGen) {
        setIsThinking(false);
        abortRef.current = null;
      } else {
        // Stop was pressed mid-tool — ensure thinking indicator is cleared
        setIsThinking(false);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionQuery !== null && mentionAgents.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionAgents.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(mentionAgents[mentionIndex]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (slashQuery !== null && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => Math.min(i + 1, filteredSlashCommands.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); setInput(filteredSlashCommands[slashIndex].name); setSlashQuery(null); return; }
      if (e.key === 'Escape') { setSlashQuery(null); return; }
    }
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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ position: 'relative' }}>
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
            <div key={m.id} className={cn('group flex flex-col', isUser ? 'items-end' : 'items-start')} style={{ animation: 'ai-pop-in 0.28s cubic-bezier(0.34,1.56,0.64,1)' }}>
              {!isSystem && (
                <span className={cn('text-[9.5px] font-semibold uppercase tracking-widest mb-0.5', isUser ? 'mr-1 text-primary' : 'ml-1 text-muted-foreground')}>
                  {roleLabel(m.role)}
                </span>
              )}
              {isSystem ? (
                <ToolMessage msg={m} />
              ) : isUser ? (
                <div className="relative max-w-[85%] px-3.5 py-2 rounded-[18px_5px_18px_18px] bg-primary text-primary-foreground text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">
                  {m.text}
                  {/* Action buttons: overlay bottom-right of bubble */}
                  <div className="absolute -bottom-6 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-md px-1 py-0.5 shadow-sm">
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-foreground" title={copiedMsgId === m.id ? '已复制!' : '复制'}
                      onClick={() => { navigator.clipboard.writeText(m.text).then(() => { setCopiedMsgId(m.id); setTimeout(() => setCopiedMsgId(null), 1500); }); }}>
                      {copiedMsgId === m.id ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      )}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" title="删除">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
                          </svg>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除消息</AlertDialogTitle>
                          <AlertDialogDescription>确定要删除这条消息吗？此操作无法撤销。</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDeleteMessage(m.id)}>删除</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ) : (
                <div className="relative flex flex-col gap-1.5 max-w-full">
                  {m.thinkingText && <ThinkingBlock text={m.thinkingText} />}
                  <div className="ai-markdown px-3 py-2 rounded-[5px_18px_18px_18px] bg-muted text-[12.5px] leading-relaxed break-words overflow-hidden">
                    <div
                    className="markdown-body"
                    style={{ background: 'transparent', fontSize: 'inherit', color: 'inherit', wordBreak: 'break-word', overflowWrap: 'break-word', overflowX: 'hidden' }}
                    dangerouslySetInnerHTML={{ __html: marked.parse(desensitizeRef.current.decode(m.text)) as string }}
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
                    <div className="flex flex-row gap-1.5 justify-end" style={{ animation: 'ai-pop-in 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}>
                      <Button variant="outline" size="icon" className="h-6 w-6 rounded-full" onClick={() => { void handleSend('no'); }} title="取消">✕</Button>
                      <Button size="icon" className="h-6 w-6 rounded-full" onClick={() => { void handleSend('yes'); }} title="确认">✓</Button>
                    </div>
                  )}
                  {/* Action buttons: overlay bottom-right of bubble */}
                  <div className="absolute -bottom-6 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-md px-1 py-0.5 shadow-sm">
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-foreground" title={copiedMsgId === m.id ? '已复制!' : '复制'}
                      onClick={() => { navigator.clipboard.writeText(m.text).then(() => { setCopiedMsgId(m.id); setTimeout(() => setCopiedMsgId(null), 1500); }); }}>
                      {copiedMsgId === m.id ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      )}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" title="删除">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
                          </svg>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除消息</AlertDialogTitle>
                          <AlertDialogDescription>确定要删除这条消息吗？此操作无法撤销。</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDeleteMessage(m.id)}>删除</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
              {m.rawLogs && m.rawLogs.length > 0 && <div className="mt-0.5"><RawLogPanel logs={m.rawLogs} /></div>}
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
          新消息 ↓
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
      <div className="px-3 pb-3.5 pt-2" style={{ position: 'relative' }}>
        {slashQuery !== null && filteredSlashCommands.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--glass-bg)', backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--glass-border)', borderRadius: 12,
            padding: 4, marginBottom: 4, boxShadow: 'var(--glass-shadow)',
          }}>
            {filteredSlashCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                onMouseDown={(e) => { e.preventDefault(); setInput(cmd.name); setSlashQuery(null); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  background: i === slashIndex ? 'var(--accent)' : 'transparent',
                  color: i === slashIndex ? 'var(--accent-foreground)' : 'var(--text-primary)',
                  fontSize: 12, border: i === slashIndex ? '1px solid var(--accent)' : '1px solid transparent',
                  outline: 'none',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{cmd.name}</span>
                  <span style={{ fontSize: 10, color: i === slashIndex ? 'var(--accent-foreground)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd.description}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        {mentionQuery !== null && mentionAgents.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--glass-bg)', backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--glass-border)', borderRadius: 12,
            padding: 4, marginBottom: 4, boxShadow: 'var(--glass-shadow)',
          }}>
            {mentionAgents.map((agent, i) => (
              <button
                key={agent.id}
                onMouseDown={(e) => { e.preventDefault(); selectMention(agent); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  background: i === mentionIndex ? 'var(--accent)' : 'transparent',
                  color: i === mentionIndex ? 'var(--accent-foreground)' : 'var(--text-primary)',
                  fontSize: 12, border: i === mentionIndex ? '1px solid var(--accent)' : '1px solid transparent',
                  outline: 'none',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{agent.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.description}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        <Dialog open={showReplayPicker} onOpenChange={setShowReplayPicker}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>选择要回放的会话</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              {sessions
                .filter((s) => s.messages.some((m) => m.toolCall))
                .map((s) => {
                  const stepCount = s.messages.filter((m) => m.toolCall && !m.toolIsError).length;
                  return (
                    <button key={s.id} onClick={() => {
                      const steps = s.messages.filter((m) => m.toolCall && !m.toolIsError).map((m) => m.toolCall!);
                      setShowReplayPicker(false);
                      void runReplay(steps);
                    }} className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-xs transition-colors">
                      <span className="flex-1 truncate">{s.messages.find((m) => m.role === 'user')?.text.slice(0, 40) ?? s.id}</span>
                      <span className="text-muted-foreground shrink-0">{stepCount} 步骤</span>
                    </button>
                  );
                })}
              {sessions.filter((s) => s.messages.some((m) => m.toolCall)).length === 0 && (
                <div className="text-xs text-muted-foreground px-3 py-2">暂无含工具调用的会话</div>
              )}
            </div>
            <div className="border-t border-border pt-2">
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-xs transition-colors">
                导入 JSON 文件…
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                try {
                  const steps = JSON.parse(ev.target?.result as string);
                  setShowReplayPicker(false);
                  void runReplay(steps);
                } catch {
                  onAddMessage('system', '无法解析 JSON 文件。');
                }
              };
              reader.readAsText(file);
              e.target.value = '';
            }} />
          </DialogContent>
        </Dialog>
        <div className="border border-border rounded-2xl px-3 py-2 flex flex-col gap-1.5 bg-background">
          {replayState && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              borderRadius: 10, border: '1px solid var(--glass-border)',
              background: 'var(--glass-bg)', fontSize: 11,
            }}>
              <span style={{ flex: 1, color: 'var(--text-muted)' }}>
                回放中 {replayState.index + 1} / {replayState.total}
              </span>
              <Button size="sm" variant="outline" className="h-5 text-[10px] px-2"
                onClick={() => { replayPausedRef.current = !replayPausedRef.current; setReplayState((p) => p ? { ...p, paused: !p.paused } : null); }}>
                {replayState.paused ? '继续' : '暂停'}
              </Button>
              <Button size="sm" variant="destructive" className="h-5 text-[10px] px-2"
                onClick={() => { replayAbortRef.current = true; replayPausedRef.current = false; setReplayState(null); onAddMessage('system', '回放已停止。'); }}>
                停止
              </Button>
            </div>
          )}
          {/* Top row: textarea */}
          {activeAgent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 2 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '1px 6px 1px 6px', borderRadius: 8,
                background: 'var(--accent-glass)', border: '1px solid var(--glass-border)',
                fontSize: 11, color: 'var(--text-primary)',
              }}>
                <span style={{ fontWeight: 600 }}>{activeAgent.label}</span>
                <button
                  onMouseDown={(e) => { e.preventDefault(); store.setActiveAgentId(sessionId, null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
                  </svg>
                </button>
              </div>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              const atIdx = val.lastIndexOf('@');
              if (atIdx !== -1 && (atIdx === 0 || /[\s\n]/.test(val[atIdx - 1]))) {
                const query = val.slice(atIdx + 1).toLowerCase();
                if (!query.includes(' ') && !query.includes('\n')) {
                  setMentionQuery(query);
                  setMentionIndex(0);
                } else {
                  setMentionQuery(null);
                }
              } else {
                setMentionQuery(null);
              }
              if (val.startsWith('/') && !val.includes(' ') && !val.includes('\n')) {
                setSlashQuery(val.slice(1).toLowerCase());
                setSlashIndex(0);
              } else {
                setSlashQuery(null);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入@使用智能体，输入/使用工具"
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
              <Select value={activeModelUid} onValueChange={onActiveModelUidChange} open={modelSelectOpen} onOpenChange={setModelSelectOpen}>
                <SelectTrigger size="sm" className="max-w-[140px] h-6 text-[11px] text-muted-foreground rounded-lg px-2">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {allModels.map((m) => (
                    <SelectItem key={m.uid} value={m.uid}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {(resolveModel(providers, activeModelUid) ?? allModels[0])?.type === 'anthropic' && (
                <Button
                  variant={thinkingEnabled ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setThinkingEnabled((v) => !v)}
                  title="思考模式"
                  className={cn('h-6 text-[10px] font-semibold px-2', thinkingEnabled && 'text-primary')}
                >
                  思考
                </Button>
              )}
            </div>
            {isRunning ? (
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
