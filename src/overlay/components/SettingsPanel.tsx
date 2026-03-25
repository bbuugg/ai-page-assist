import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { type ProviderConfig, type ModelEntry, type ProviderType, PROVIDER_TYPE_DEFAULTS, type McpServerConfig } from '../../lib/storage';
import { useChatStore } from '../store';
import type { McpTransportType } from '../../lib/mcp';
import AgentsPanel from './AgentsPanel';
import { fetchMcpTools, type McpTool } from '../../lib/mcp';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { HugeiconsIcon } from '@hugeicons/react';
import { Upload01Icon, Download01Icon, ArrowRight01Icon, Refresh01Icon, PencilEdit01Icon, EyeIcon, Add01Icon, Delete01Icon, Tick01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';

interface Props {
  onClose: () => void;
  onModelsChange: () => void;
  onModalOpenChange?: (open: boolean) => void;
  providers: ProviderConfig[];
  activeModelUid: string;
  onProvidersChange: (providers: ProviderConfig[], activeModelUid?: string) => void;
}

export default function SettingsPanel({ onClose, onModelsChange, onModalOpenChange, providers, activeModelUid, onProvidersChange }: Props) {
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [provModalOpen, setProvModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<{ providerId: string; entry: ModelEntry } | null>(null);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const mcpServers = useChatStore((s) => s.mcpServers);
  const disabledTools = useChatStore((s) => s.disabledTools);
  const compressThreshold = useChatStore((s) => s.compressThreshold);
  const [agentDialogTrigger, setAgentDialogTrigger] = useState(0);
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [collapsedProviders, setCollapsedProviders] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'provider'; id: string; name: string } | { type: 'model'; providerId: string; entryId: string; name: string } | null>(null);

  async function fetchModelsForProvider(prov: ProviderConfig) {
    setFetchingModels((prev) => ({ ...prev, [prov.id]: true }));
    try {
      let url: string;
      let headers: Record<string, string> = {};
      if (prov.type === 'anthropic') {
        url = `${prov.baseURL.replace(/\/$/, '')}/v1/models`;
        headers = { 'x-api-key': prov.apiKey, 'anthropic-version': '2023-06-01' };
      } else {
        url = `${prov.baseURL.replace(/\/$/, '')}/models`;
        if (prov.apiKey) headers = { Authorization: `Bearer ${prov.apiKey}` };
      }
      const res = await new Promise<{ text?: string; error?: string }>((resolve) =>
        chrome.runtime.sendMessage({ action: 'fetchUrl', url, headers }, resolve)
      );
      if (res.error) { toast.error(`拉取失败: ${res.error}`); return; }
      const json = JSON.parse(res.text ?? '{}');
      // Anthropic: json.data[].id, OpenAI: json.data[].id
      const ids: string[] = Array.isArray(json.data)
        ? json.data.map((m: { id: string }) => m.id).filter(Boolean)
        : [];
      if (ids.length === 0) { toast.error('未找到模型'); return; }
      const newEntries: ModelEntry[] = ids.map((id) => ({
        id: `fetched-${id}`,
        label: id,
        modelId: id,
      }));
      // Merge: keep existing entries that are not in fetched list, add new ones
      const existingModelIds = new Set(prov.models.map((m) => m.modelId));
      const toAdd = newEntries.filter((e) => !existingModelIds.has(e.modelId));
      const merged = [...prov.models, ...toAdd];
      onProvidersChange(providers.map((p) => p.id === prov.id ? { ...p, models: merged } : p));
      toast.success(`已添加 ${toAdd.length} 个新模型`);
    } catch (e) {
      toast.error(`拉取失败: ${String(e)}`);
    } finally {
      setFetchingModels((prev) => ({ ...prev, [prov.id]: false }));
    }
  }
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
    } catch (e) {
      setMcpToolsError((prev) => ({ ...prev, [srv.id]: String(e) }));
    } finally {
      setMcpToolsLoading((prev) => ({ ...prev, [srv.id]: false }));
    }
  }

  function toggleMcpTool(toolName: string) {
    const next = disabledTools.includes(toolName) ? disabledTools.filter((t) => t !== toolName) : [...disabledTools, toolName];
    useChatStore.getState().setDisabledTools(next);
  }

  function openAddProvider() {
    const type: ProviderType = 'anthropic';
    const defaults = PROVIDER_TYPE_DEFAULTS[type];
    setEditingProvider({ id: `prov-${Date.now()}`, name: '', type, apiKey: '', baseURL: defaults.baseURL, models: [] });
    setProvModalOpen(true);
    onModalOpenChange?.(true);
  }

  function openEditProvider(prov: ProviderConfig) {
    setEditingProvider({ ...prov });
    setProvModalOpen(true);
    onModalOpenChange?.(true);
  }

  function handleProviderTypeChange(type: ProviderType) {
    if (!editingProvider) return;
    setEditingProvider({ ...editingProvider, type, baseURL: PROVIDER_TYPE_DEFAULTS[type].baseURL });
  }

  function handleProviderSave() {
    if (!editingProvider) return;
    const exists = providers.some((p) => p.id === editingProvider.id);
    const next = exists
      ? providers.map((p) => p.id === editingProvider.id ? editingProvider : p)
      : [...providers, editingProvider];
    onProvidersChange(next);
    onModelsChange();
    setProvModalOpen(false);
    onModalOpenChange?.(false);
    toast.success(exists ? 'Provider updated' : 'Provider added');
  }

  function handleProviderDelete() {
    if (!editingProvider) return;
    if (providers.length <= 1) { toast.error('Cannot delete the only provider'); return; }
    const next = providers.filter((p) => p.id !== editingProvider.id);
    // If active model was under the deleted provider, reset to first available
    const deletedProvId = editingProvider.id;
    const activeIsUnderDeleted = activeModelUid.startsWith(deletedProvId + '/');
    const fallbackUid = activeIsUnderDeleted ? (next[0]?.models[0] ? `${next[0].id}/${next[0].models[0].id}` : '') : undefined;
    onProvidersChange(next, fallbackUid);
    onModelsChange();
    setProvModalOpen(false);
    onModalOpenChange?.(false);
    toast.success('Provider deleted');
  }

  function openEditEntry(providerId: string, entry: ModelEntry) {
    setEditingEntry({ providerId, entry: { ...entry } });
    setEntryModalOpen(true);
    onModalOpenChange?.(true);
  }

  function addModelEntry(providerId: string) {
    const prov = providers.find((p) => p.id === providerId);
    if (!prov) return;
    const defaults = PROVIDER_TYPE_DEFAULTS[prov.type];
    setEditingEntry({ providerId, entry: { id: Date.now().toString(), label: 'New Model', modelId: defaults.modelId } });
    setEntryModalOpen(true);
    onModalOpenChange?.(true);
  }

  function handleEntrySave() {
    if (!editingEntry) return;
    const next = providers.map((p) => {
      if (p.id !== editingEntry.providerId) return p;
      const exists = p.models.some((m) => m.id === editingEntry.entry.id);
      return {
        ...p,
        models: exists
          ? p.models.map((m) => m.id === editingEntry.entry.id ? editingEntry.entry : m)
          : [...p.models, editingEntry.entry],
      };
    });
    onProvidersChange(next);
    onModelsChange();
    setEntryModalOpen(false);
    onModalOpenChange?.(false);
  }

  function deleteModelEntry(providerId: string, entryId: string) {
    const next = providers.map((p) =>
      p.id === providerId ? { ...p, models: p.models.filter((m) => m.id !== entryId) } : p
    );
    const deletedUid = `${providerId}/${entryId}`;
    let fallbackUid: string | undefined;
    if (activeModelUid === deletedUid) {
      const firstModel = next.flatMap((p) => p.models.map((m) => `${p.id}/${m.id}`))[0] ?? '';
      fallbackUid = firstModel;
    }
    onProvidersChange(next, fallbackUid);
    onModelsChange();
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
    const data = JSON.stringify({ providers, mcpServers, disabledTools }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-page-assist-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('设置已导出');
  }

  function importSettingsFromJson(json: string) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed.providers) && parsed.providers.length > 0) {
        onProvidersChange(parsed.providers);
        onModelsChange();
      }
      if (Array.isArray(parsed.mcpServers)) {
        useChatStore.getState().setMcpServers(parsed.mcpServers);
      }
      if (Array.isArray(parsed.disabledTools)) {
        useChatStore.getState().setDisabledTools(parsed.disabledTools);
      }
      toast.success('设置已导入');
    } catch {
      toast.error('JSON 格式无效');
    }
  }

  function handleConfirmDelete() {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'provider') {
      const next = providers.filter((p) => p.id !== confirmDelete.id);
      const fallback = activeModelUid.startsWith(confirmDelete.id + '/') ? (next[0]?.models[0] ? `${next[0].id}/${next[0].models[0].id}` : '') : undefined;
      onProvidersChange(next, fallback);
      onModelsChange();
      toast.success('服务商已删除');
    } else {
      deleteModelEntry(confirmDelete.providerId, confirmDelete.entryId);
      toast.success('模型已删除');
    }
    setConfirmDelete(null);
  }

  return (
    <>
    <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmDelete?.type === 'provider'
              ? `确定要删除服务商「${confirmDelete.name}」及其所有模型吗？`
              : `确定要删除模型「${confirmDelete?.name}」吗？`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Fixed header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-background shrink-0">
        <span className="text-xs font-semibold tracking-tight">设置</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setImportDialogOpen(true)} className="h-6 text-[11px] gap-1" title="导入设置">
            <HugeiconsIcon icon={Upload01Icon} size={11} />
            导入
          </Button>
          <Button variant="ghost" size="sm" onClick={exportAllSettings} className="h-6 text-[11px] gap-1" title="导出所有设置">
            <HugeiconsIcon icon={Download01Icon} size={11} />
            导出
          </Button>
        </div>
      </div>

      {/* Single scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ── Providers ── */}
        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-1.5">
          <span className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-widest">服务商</span>
          <Button variant="outline" size="sm" onClick={openAddProvider} className="h-6 text-[11px] gap-1">
            <HugeiconsIcon icon={Add01Icon} size={11} />
            添加服务商
          </Button>
        </div>
        <div className="px-3.5 pb-4 flex flex-col gap-2">
          {providers.map((prov) => {
            const isCollapsed = collapsedProviders[prov.id] ?? true;
            return (
            <div key={prov.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--muted)', cursor: 'pointer' }} onClick={() => setCollapsedProviders((prev) => ({ ...prev, [prov.id]: !isCollapsed }))}>
                <HugeiconsIcon icon={ArrowRight01Icon} size={9} style={{ flexShrink: 0, transform: isCollapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s' }} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{prov.name} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted-foreground)' }}>({prov.type})</span></span>
                <Button variant="ghost" size="icon" className="h-6 w-6" title="Add model" onClick={(e) => { e.stopPropagation(); addModelEntry(prov.id); }}>
                  <HugeiconsIcon icon={Add01Icon} size={11} />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" title="拉取模型" disabled={fetchingModels[prov.id]} onClick={(e) => { e.stopPropagation(); fetchModelsForProvider(prov); }}>
                  <HugeiconsIcon icon={Refresh01Icon} size={11} style={{ animation: fetchingModels[prov.id] ? 'spin 1s linear infinite' : 'none' }} />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEditProvider(prov); }}>
                  <HugeiconsIcon icon={PencilEdit01Icon} size={12} />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); if (providers.length <= 1) { toast.error('Cannot delete the only provider'); return; } setConfirmDelete({ type: 'provider', id: prov.id, name: prov.name }); }}>
                  <HugeiconsIcon icon={Delete01Icon} size={12} />
                </Button>
              </div>
              {!isCollapsed && <div style={{ padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {prov.models.map((entry) => (
                  <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ flex: 1 }}>{entry.label}</span>
                    <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{entry.modelId}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openEditEntry(prov.id, entry)}>
                      <HugeiconsIcon icon={PencilEdit01Icon} size={10} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => setConfirmDelete({ type: 'model', providerId: prov.id, entryId: entry.id, name: entry.label })}>
                      <HugeiconsIcon icon={Delete01Icon} size={10} />
                    </Button>
                  </div>
                ))}
              </div>}
            </div>
          );
          })}
        </div>

        {/* Provider Modal */}
        <Dialog open={provModalOpen} onOpenChange={(o) => { setProvModalOpen(o); onModalOpenChange?.(o); }}>
          <DialogContent className="max-w-sm" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{providers.some((p) => p.id === editingProvider?.id) ? 'Edit Provider' : 'Add Provider'}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Name</label>
                <Input value={editingProvider?.name ?? ''} onChange={(e) => setEditingProvider((p) => p ? { ...p, name: e.target.value } : p)} placeholder="e.g. My Anthropic" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={editingProvider?.type} onValueChange={(v) => handleProviderTypeChange(v as ProviderType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="ollama">Ollama (local)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">API Key</label>
                <Input type="password" value={editingProvider?.apiKey ?? ''} onChange={(e) => setEditingProvider((p) => p ? { ...p, apiKey: e.target.value } : p)} placeholder={editingProvider ? PROVIDER_TYPE_DEFAULTS[editingProvider.type].placeholder : ''} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Base URL</label>
                <Input value={editingProvider?.baseURL ?? ''} onChange={(e) => setEditingProvider((p) => p ? { ...p, baseURL: e.target.value } : p)} />
              </div>
            </div>
            <div className="flex justify-between pt-1">
              {providers.some((p) => p.id === editingProvider?.id) && (
                <Button variant="destructive" size="sm" onClick={handleProviderDelete}>Delete</Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={() => { setProvModalOpen(false); onModalOpenChange?.(false); }}>Cancel</Button>
                <Button size="sm" onClick={handleProviderSave}>Save</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Model Entry Modal */}
        <Dialog open={entryModalOpen} onOpenChange={(o) => { setEntryModalOpen(o); onModalOpenChange?.(o); }}>
          <DialogContent className="max-w-sm" aria-describedby={undefined}>
            <DialogHeader><DialogTitle>Model Entry</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Label</label>
                <Input value={editingEntry?.entry.label ?? ''} onChange={(e) => setEditingEntry((s) => s ? { ...s, entry: { ...s.entry, label: e.target.value } } : s)} placeholder="e.g. Claude Sonnet" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Model ID</label>
                <Input value={editingEntry?.entry.modelId ?? ''} onChange={(e) => setEditingEntry((s) => s ? { ...s, entry: { ...s.entry, modelId: e.target.value } } : s)} placeholder="e.g. claude-sonnet-4-6" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setEntryModalOpen(false); onModalOpenChange?.(false); }}>Cancel</Button>
              <Button size="sm" onClick={handleEntrySave}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="h-px bg-border mx-3.5" />

        {/* ── MCP ── */}
        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-1.5">
          <span className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-widest">MCP 服务器</span>
          <Button variant="outline" size="sm" onClick={openAddMcp} className="h-6 text-[11px] gap-1">
            <HugeiconsIcon icon={Add01Icon} size={11} />
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
                  {mcpTools[srv.id] && (
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1"
                      onClick={() => setMcpToolsExpanded((prev) => ({ ...prev, [srv.id]: !prev[srv.id] }))}
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} size={9} style={{ transform: mcpToolsExpanded[srv.id] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
                      工具 ({mcpTools[srv.id].length})
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={mcpToolsLoading[srv.id]} onClick={() => refreshMcpTools(srv)} title="刷新工具">
                    <HugeiconsIcon icon={Refresh01Icon} size={10} style={{ animation: mcpToolsLoading[srv.id] ? 'spin 1s linear infinite' : 'none' }} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditMcp(srv)} title="编辑">
                    <HugeiconsIcon icon={PencilEdit01Icon} size={11} />
                  </Button>
                  <Switch checked={srv.enabled} onCheckedChange={(v) => useChatStore.getState().setMcpServers(mcpServers.map((s) => s.id === srv.id ? { ...s, enabled: v } : s))} />
                </div>
              </div>
              {mcpToolsError[srv.id] && <div className="text-[10.5px] text-destructive py-0.5">{mcpToolsError[srv.id]}</div>}
              {mcpTools[srv.id] && mcpToolsExpanded[srv.id] && (
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
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">请求头（鉴权）</label>
                    <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2" onClick={() => updateEditingMcp('headers', { ...(editingMcpServer.headers ?? {}), '': '' })}>+ 添加</Button>
                  </div>
                  {Object.entries(editingMcpServer.headers ?? {}).map(([k, v], i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Input
                        value={k}
                        onChange={(e) => {
                          const entries = Object.entries(editingMcpServer.headers ?? {});
                          entries[i] = [e.target.value, v];
                          updateEditingMcp('headers', Object.fromEntries(entries));
                        }}
                        placeholder="Header 名称"
                        className="h-7 text-xs flex-1"
                      />
                      <Input
                        value={v}
                        onChange={(e) => {
                          const entries = Object.entries(editingMcpServer.headers ?? {});
                          entries[i] = [k, e.target.value];
                          updateEditingMcp('headers', Object.fromEntries(entries));
                        }}
                        placeholder="值"
                        className="h-7 text-xs flex-1"
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => {
                        const entries = Object.entries(editingMcpServer.headers ?? {}).filter((_, j) => j !== i);
                        updateEditingMcp('headers', Object.fromEntries(entries));
                      }}><HugeiconsIcon icon={Cancel01Icon} size={11} /></Button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">启用</label>
                  <Switch checked={editingMcpServer.enabled} onCheckedChange={(v) => updateEditingMcp('enabled', v)} />
                </div>
                <div className="flex justify-between items-center pt-1">
                  {mcpServers.some((s) => s.id === editingMcpServer.id) ? (
                    <Button variant="destructive" size="sm" onClick={handleMcpModalDelete} className="gap-1 text-xs">
                      <HugeiconsIcon icon={Delete01Icon} size={13} /> 删除
                    </Button>
                  ) : <div />}
                  <Button size="sm" onClick={handleMcpModalSave} className="gap-1 text-xs">
                    <HugeiconsIcon icon={Tick01Icon} size={13} /> 保存
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
                className="font-mono text-[11px] min-h-[120px] max-h-[240px] resize-none overflow-y-auto"
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => importFileRef.current?.click()}>
                  <HugeiconsIcon icon={Upload01Icon} size={11} />
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
                  <HugeiconsIcon icon={Tick01Icon} size={13} /> 导入
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="h-px bg-border mx-3.5" />

        {/* ── Agents ── */}
        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-1.5">
          <span className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-widest">Agents</span>
          <Button variant="outline" size="sm" onClick={() => setAgentDialogTrigger((v) => v + 1)} className="h-6 text-[11px] gap-1">
            <HugeiconsIcon icon={Add01Icon} size={11} />
            添加 Agent
          </Button>
        </div>
        <AgentsPanel openDialogTrigger={agentDialogTrigger} onModalOpenChange={onModalOpenChange} />

        <div className="h-px bg-border mx-3.5" />

        {/* ── Context Compression ── */}
        <div className="px-3.5 pt-3.5 pb-4 flex flex-col gap-2">
          <span className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-widest">上下文压缩</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground flex-1">消息数阈值（0 = 禁用）</span>
            <input
              type="number"
              min={0}
              step={2}
              value={compressThreshold}
              onChange={(e) => useChatStore.getState().setCompressThreshold(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-16 h-6 text-[11px] text-center rounded border border-border bg-background px-1"
            />
          </div>
          <p className="text-[10.5px] text-muted-foreground leading-relaxed">当对话历史超过此消息数时自动压缩。输入 <code className="bg-muted px-1 rounded">/compress</code> 立即压缩，输入 <code className="bg-muted px-1 rounded">/clear</code> 清空上下文。</p>
        </div>

      </div>

    </div>
    </>
  );
}
