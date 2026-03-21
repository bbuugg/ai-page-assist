import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { loadModels, saveModels, type ModelConfig, type Provider, PROVIDER_DEFAULTS, type McpServerConfig } from '../../lib/storage';
import { useChatStore } from '../store';
import type { McpTransportType } from '../../lib/mcp';
import { TOOL_META } from '../../lib/tools/index';
import { fetchMcpTools, type McpTool } from '../../lib/mcp';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Check, Cpu, Plus, Trash2 } from 'lucide-react';

interface Props {
  onClose: () => void;
  onModelsChange: () => void;
  onModalOpenChange?: (open: boolean) => void;
}


const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai',    label: 'OpenAI' },
  { value: 'ollama',    label: 'Ollama (local)' },
];

function newModel(): ModelConfig {
  return {
    id: Date.now().toString(),
    name: 'New Model',
    provider: 'anthropic',
    apiKey: '',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-6',
  };
}

const TOOLS_INITIAL_COUNT = 6;

export default function SettingsPanel({ onClose, onModelsChange, onModalOpenChange }: Props) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const setModalOpenWithNotify = (open: boolean) => { setModalOpen(open); onModalOpenChange?.(open); };
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const mcpServers = useChatStore((s) => s.mcpServers);
  const disabledTools = useChatStore((s) => s.disabledTools);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [mcpTools, setMcpTools] = useState<Record<string, McpTool[]>>({});
  const [mcpToolsLoading, setMcpToolsLoading] = useState<Record<string, boolean>>({});
  const [mcpToolsExpanded, setMcpToolsExpanded] = useState<Record<string, boolean>>({});
  const [mcpToolsError, setMcpToolsError] = useState<Record<string, string>>({});
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const setMcpModalOpenWithNotify = (open: boolean) => { setMcpModalOpen(open); onModalOpenChange?.(open); };
  const [editingMcpServer, setEditingMcpServer] = useState<McpServerConfig | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadModels().then(({ models: ms, activeModelId: aid }) => {
      setModels(ms);
      setActiveModelId(aid);
    });
  }, []);

  // Auto-load tools for enabled servers on mount
  useEffect(() => {
    if (mcpServers.length === 0) return;
    mcpServers.filter((s) => s.enabled).forEach((srv) => {
      if (!mcpTools[srv.id]) {
        setMcpToolsLoading((prev) => ({ ...prev, [srv.id]: true }));
        fetchMcpTools(srv).then((tools) => {
          setMcpTools((prev) => ({ ...prev, [srv.id]: tools }));
        }).catch((e) => {
          setMcpToolsError((prev) => ({ ...prev, [srv.id]: String(e) }));
        }).finally(() => {
          setMcpToolsLoading((prev) => ({ ...prev, [srv.id]: false }));
        });
      }
    });
  }, [mcpServers.length]);

  function newMcpServer(): McpServerConfig {
    return { id: Date.now().toString(), name: '', url: '', enabled: true, type: 'http' };
  }


  async function refreshMcpTools(srv: McpServerConfig) {
    setMcpToolsLoading((prev) => ({ ...prev, [srv.id]: true }));
    setMcpToolsError((prev) => ({ ...prev, [srv.id]: '' }));
    try {
      const tools = await fetchMcpTools(srv);
      setMcpTools((prev) => ({ ...prev, [srv.id]: tools }));
      setMcpToolsExpanded((prev) => ({ ...prev, [srv.id]: true }));
      toast.success(`已加载 ${tools.length} 个工具`);
    } catch (e) {
      setMcpToolsError((prev) => ({ ...prev, [srv.id]: String(e) }));
      toast.error(`加载工具失败：${String(e)}`);
    } finally {
      setMcpToolsLoading((prev) => ({ ...prev, [srv.id]: false }));
    }
  }

  function toggleMcpTool(toolName: string) {
    const next = disabledTools.includes(toolName) ? disabledTools.filter((t) => t !== toolName) : [...disabledTools, toolName];
    useChatStore.getState().setDisabledTools(next);
  }

  function toggleTool(name: string) {
    const next = disabledTools.includes(name) ? disabledTools.filter((t) => t !== name) : [...disabledTools, name];
    useChatStore.getState().setDisabledTools(next);
  }

  function openAdd() {
    setEditingModel(newModel());
    setModalOpenWithNotify(true);
  }

  function openEdit(m: ModelConfig) {
    setEditingModel({ ...m });
    setModalOpenWithNotify(true);
  }

  function updateEditing<K extends keyof ModelConfig>(field: K, value: ModelConfig[K]) {
    setEditingModel((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  function handleEditingProviderChange(provider: Provider) {
    const defaults = PROVIDER_DEFAULTS[provider];
    setEditingModel((prev) => prev ? { ...prev, provider, baseURL: defaults.baseURL, model: defaults.model } : prev);
  }

  async function handleModalSave() {
    if (!editingModel) return;
    const exists = models.some((m) => m.id === editingModel.id);
    const next = exists
      ? models.map((m) => m.id === editingModel.id ? editingModel : m)
      : [...models, editingModel];
    setModels(next);
    await saveModels(next, activeModelId);
    onModelsChange();
    toast.success(exists ? '模型已更新' : '模型已添加');
    setModalOpenWithNotify(false);
  }

  function handleModalDelete() {
    if (!editingModel || models.length <= 1) return;
    const next = models.filter((m) => m.id !== editingModel.id);
    setModels(next);
    const newActive = activeModelId === editingModel.id ? (next[0]?.id ?? '') : activeModelId;
    setActiveModelId(newActive);
    saveModels(next, newActive);
    onModelsChange();
    toast.success('模型已删除');
    setModalOpenWithNotify(false);
  }

  function openAddMcp() {
    setEditingMcpServer(newMcpServer());
    setMcpModalOpenWithNotify(true);
  }

  function openEditMcp(srv: McpServerConfig) {
    setEditingMcpServer({ ...srv });
    setMcpModalOpenWithNotify(true);
  }

  function updateEditingMcp<K extends keyof McpServerConfig>(field: K, value: McpServerConfig[K]) {
    setEditingMcpServer((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  function handleMcpModalSave() {
    if (!editingMcpServer) return;
    const exists = mcpServers.some((s) => s.id === editingMcpServer.id);
    const next = exists
      ? mcpServers.map((s) => s.id === editingMcpServer.id ? editingMcpServer : s)
      : [...mcpServers, editingMcpServer];
    useChatStore.getState().setMcpServers(next);
    toast.success(exists ? 'MCP 服务器已更新' : 'MCP 服务器已添加');
    setMcpModalOpenWithNotify(false);
  }

  function handleMcpModalDelete() {
    if (!editingMcpServer) return;
    useChatStore.getState().setMcpServers(mcpServers.filter((s) => s.id !== editingMcpServer.id));
    toast.success('MCP 服务器已删除');
    setMcpModalOpenWithNotify(false);
  }

  function exportAllSettings() {
    loadModels().then(({ models: ms, activeModelId: aid }) => {
      const data = JSON.stringify({ models: ms, activeModelId: aid, mcpServers, disabledTools }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ai-page-assist-settings.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('设置已导出');
    });
  }

  function importSettingsFromJson(json: string) {
    try {
      const parsed = JSON.parse(json);
      const promises: Promise<void>[] = [];
      if (Array.isArray(parsed.models) && parsed.models.length > 0) {
        const aid = parsed.activeModelId ?? parsed.models[0].id;
        setModels(parsed.models);
        setActiveModelId(aid);
        promises.push(saveModels(parsed.models, aid));
        onModelsChange();
      }
      if (Array.isArray(parsed.mcpServers)) {
        useChatStore.getState().setMcpServers(parsed.mcpServers);
      }
      if (Array.isArray(parsed.disabledTools)) {
        useChatStore.getState().setDisabledTools(parsed.disabledTools);
      }
      Promise.all(promises).then(() => toast.success('设置已导入'));
    } catch {
      toast.error('JSON 格式无效');
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Fixed header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-background shrink-0">
        <span className="text-xs font-semibold tracking-tight">设置</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setImportDialogOpen(true)} className="h-6 text-[11px] gap-1" title="导入设置">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 14 12 9 17 14"/><line x1="12" y1="9" x2="12" y2="21"/></svg>
            导入
          </Button>
          <Button variant="ghost" size="sm" onClick={exportAllSettings} className="h-6 text-[11px] gap-1" title="导出所有设置">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            导出
          </Button>
        </div>
      </div>

      {/* Single scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ── Models ── */}
        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-1.5">
          <span className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-widest">模型</span>
          <Button variant="outline" size="sm" onClick={openAdd} className="h-6 text-[11px] gap-1">
            <Plus size={11} />
            添加模型
          </Button>
        </div>
        <div className="px-3.5 pb-4 flex flex-col gap-1.5">
          {models.map((m) => (
            <div key={m.id} onClick={() => openEdit(m)} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer border border-border bg-muted/30 hover:bg-muted transition-colors">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Cpu size={15} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{m.name}</div>
                <div className="text-[10.5px] text-muted-foreground mt-0.5">{m.model} · {m.provider}</div>
              </div>
              {activeModelId === m.id && (
                <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                  <Check size={9} />
                  使用中
                </Badge>
              )}
            </div>
          ))}
        </div>

        {/* Model Modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpenWithNotify}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{editingModel && models.some((m) => m.id === editingModel.id) ? '编辑模型' : '添加模型'}</DialogTitle>
            </DialogHeader>
            {editingModel && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">名称</label><Input value={editingModel.name} onChange={(e) => updateEditing('name', e.target.value)} /></div>
                <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">提供商</label>
                  <Select value={editingModel.provider} onValueChange={(v) => handleEditingProviderChange(v as Provider)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">模型</label><Input value={editingModel.model} onChange={(e) => updateEditing('model', e.target.value)} /></div>
                {editingModel.provider !== 'ollama' && (
                  <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">API Key</label><Input type="password" value={editingModel.apiKey} placeholder={PROVIDER_DEFAULTS[editingModel.provider].placeholder} onChange={(e) => updateEditing('apiKey', e.target.value)} /></div>
                )}
                <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Base URL</label><Input value={editingModel.baseURL} onChange={(e) => updateEditing('baseURL', e.target.value)} /></div>
                <div className="flex items-center gap-2">
                  <Switch checked={activeModelId === editingModel.id} onCheckedChange={() => { setActiveModelId(editingModel.id); saveModels(models, editingModel.id); onModelsChange(); }} />
                  <span className="text-xs text-muted-foreground">设为默认模型</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button onClick={handleModalSave} className="flex-1">保存</Button>
                  {models.some((m) => m.id === editingModel.id) && models.length > 1 && (
                    <Button variant="destructive" onClick={handleModalDelete} className="gap-1.5">
                      <Trash2 size={13} /> 删除
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <div className="h-px bg-border mx-3.5" />

        {/* ── MCP ── */}
        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-1.5">
          <span className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-widest">MCP 服务器</span>
          <Button variant="outline" size="sm" onClick={openAddMcp} className="h-6 text-[11px] gap-1">
            <Plus size={11} />
            添加服务器
          </Button>
        </div>
        {/* MCP server cards */}
        <div className="px-3.5 pb-2 flex flex-col gap-2">
          {mcpServers.length === 0 && <div className="text-[11px] text-muted-foreground italic py-1.5">未配置 MCP 服务器。</div>}
          {mcpServers.map((srv) => (
            <div key={srv.id} className="rounded-xl border border-border bg-muted/30 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{srv.name || <span className="text-muted-foreground italic">未命名</span>}</div>
                  <div className="text-[10.5px] text-muted-foreground truncate">{srv.url}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-6 text-[11px]" disabled={mcpToolsLoading[srv.id]} onClick={() => refreshMcpTools(srv)}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: mcpToolsLoading[srv.id] ? 'spin 1s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    {mcpTools[srv.id] ? `工具 (${mcpTools[srv.id].length})` : '加载工具'}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditMcp(srv)} title="编辑">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </Button>
                  <Switch checked={srv.enabled} onCheckedChange={(v) => useChatStore.getState().setMcpServers(mcpServers.map((s) => s.id === srv.id ? { ...s, enabled: v } : s))} />
                </div>
              </div>
              {mcpToolsError[srv.id] && <div className="text-[10.5px] text-destructive py-0.5">{mcpToolsError[srv.id]}</div>}
              {mcpTools[srv.id] && (
                <div className="flex flex-col gap-1 pt-1">
                  {mcpTools[srv.id].map((tool) => {
                    const tname = tool.name;
                    const enabled = !disabledTools.includes(tname);
                    return (
                      <div key={tool.name} onClick={() => toggleMcpTool(tname)} className={cn('flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer border transition-colors', enabled ? 'bg-primary/5 border-primary/20' : 'border-border hover:bg-muted/50')}>
                        <div className="flex-1 min-w-0">
                          <div className={cn('text-[11px] font-semibold', enabled ? 'text-foreground' : 'text-muted-foreground')}>{tool.name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{tool.description}</div>
                        </div>
                        <Switch size="sm" checked={enabled} onClick={(e) => e.stopPropagation()} onCheckedChange={() => toggleMcpTool(tname)} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* MCP Dialog */}
        <Dialog open={mcpModalOpen} onOpenChange={setMcpModalOpenWithNotify}>
          <DialogContent aria-describedby={undefined} className="w-[320px] p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-4 py-3 border-b border-border">
              <DialogTitle className="text-sm">{editingMcpServer && mcpServers.some((s) => s.id === editingMcpServer.id) ? '编辑服务器' : '添加服务器'}</DialogTitle>
            </DialogHeader>
            {editingMcpServer && (
              <div className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">名称</label>
                  <Input value={editingMcpServer.name} onChange={(e) => updateEditingMcp('name', e.target.value)} placeholder="我的 MCP 服务器" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">URL</label>
                  <Input value={editingMcpServer.url} onChange={(e) => updateEditingMcp('url', e.target.value)} placeholder="http://localhost:3000/mcp" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">传输类型</label>
                  <Select value={editingMcpServer.type ?? 'http'} onValueChange={(v) => updateEditingMcp('type', v as McpTransportType)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http">HTTP (JSON-RPC)</SelectItem>
                      <SelectItem value="streamable-http">Streamable HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">启用</label>
                  <Switch checked={editingMcpServer.enabled} onCheckedChange={(v) => updateEditingMcp('enabled', v)} />
                </div>
                <div className="flex justify-between items-center pt-1">
                  {mcpServers.some((s) => s.id === editingMcpServer.id) ? (
                    <Button variant="destructive" size="sm" onClick={handleMcpModalDelete} className="gap-1 text-xs">
                      <Trash2 size={13} /> 删除
                    </Button>
                  ) : <div />}
                  <Button size="sm" onClick={handleMcpModalSave} className="gap-1 text-xs">
                    <Check size={13} /> 保存
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Import Dialog */}
        <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) setImportText(''); }}>
          <DialogContent aria-describedby={undefined} className="w-[340px] p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-4 py-3 border-b border-border">
              <DialogTitle className="text-sm">导入设置</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 p-4">
              <div className="text-[11px] text-muted-foreground">粘贴 JSON，或选择本地文件导入。</div>
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='{"models": [...], "mcpServers": [...]}'
                className="font-mono text-[11px] min-h-[120px] resize-none"
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => importFileRef.current?.click()}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 14 12 9 17 14"/><line x1="12" y1="9" x2="12" y2="21"/></svg>
                  选择文件
                </Button>
                <input ref={importFileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => setImportText(ev.target?.result as string ?? '');
                  reader.readAsText(file);
                  e.target.value = '';
                }} />
                <Button size="sm" className="ml-auto text-xs gap-1" disabled={!importText.trim()} onClick={() => { importSettingsFromJson(importText); setImportDialogOpen(false); setImportText(''); }}>
                  <Check size={13} /> 导入
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="h-px bg-border mx-3.5" />

        {/* ── Tools ── */}
        <div className="px-3.5 pt-3.5 pb-1 text-[10.5px] font-bold text-muted-foreground uppercase tracking-widest">工具</div>
        <div className="px-3 pb-4 flex flex-col gap-1">
          {(toolsExpanded ? TOOL_META : TOOL_META.slice(0, TOOLS_INITIAL_COUNT)).map((tool) => {
            const enabled = !disabledTools.includes(tool.name);
            return (
              <div key={tool.name} onClick={() => toggleTool(tool.name)} className={cn('flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer border transition-colors', enabled ? 'bg-primary/5 border-primary/20' : 'border-border hover:bg-muted/50')}>
                <div className="flex-1 min-w-0">
                  <div className={cn('text-xs font-semibold', enabled ? 'text-foreground' : 'text-muted-foreground')}>{tool.label}</div>
                  <div className="text-[10.5px] text-muted-foreground mt-0.5">{tool.description}</div>
                </div>
                <Switch size="sm" checked={enabled} onClick={(e) => e.stopPropagation()} onCheckedChange={() => toggleTool(tool.name)} />
              </div>
            );
          })}
          {TOOL_META.length > TOOLS_INITIAL_COUNT && (
            <Button variant="outline" size="sm" onClick={() => setToolsExpanded((v) => !v)} className="mt-0.5 w-full text-[11px]">
              {toolsExpanded ? '▲ 收起' : `▼ 显示全部 (${TOOL_META.length})`}
            </Button>
          )}
        </div>

      </div>

    </div>
  );
}
