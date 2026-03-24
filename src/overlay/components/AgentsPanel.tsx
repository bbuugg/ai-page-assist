import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { getAllAgents, type Agent } from '../../lib/agents';
import { useChatStore } from '../store';
import { TOOL_META } from '../../lib/tools';

const ALL_TOOL_NAMES = TOOL_META.map((t) => t.name);

const EMPTY_FORM = { name: '', label: '', description: '', systemPrompt: '', recommendedTools: [] as string[] };

interface Props {
  openDialogTrigger?: number;
  onModalOpenChange?: (open: boolean) => void;
}

export default function AgentsPanel({ openDialogTrigger, onModalOpenChange }: Props) {
  const store = useChatStore();
  const customAgents = useChatStore((s) => s.customAgents);
  const agentDisabledTools = useChatStore((s) => s.agentDisabledTools);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const allAgents = getAllAgents(customAgents);

  useEffect(() => {
    if (!openDialogTrigger) return;
    setForm(EMPTY_FORM);
    setDialogOpen(true);
    onModalOpenChange?.(true);
  }, [openDialogTrigger]);

  function closeDialog() {
    setDialogOpen(false);
    onModalOpenChange?.(false);
  }

  function toggleAgentTool(agentId: string, toolName: string) {
    const current = agentDisabledTools[agentId] ?? [];
    const next = current.includes(toolName)
      ? current.filter((t) => t !== toolName)
      : [...current, toolName];
    store.setAgentDisabledTools({ ...agentDisabledTools, [agentId]: next });
  }

  function toggleFormTool(toolName: string) {
    setForm((f) => ({
      ...f,
      recommendedTools: f.recommendedTools.includes(toolName)
        ? f.recommendedTools.filter((x) => x !== toolName)
        : [...f.recommendedTools, toolName],
    }));
  }

  function handleDelete(id: string) {
    store.setCustomAgents(customAgents.filter((s) => s.id !== id));
  }

  function handleSave() {
    if (!form.name.trim() || !form.label.trim() || !form.systemPrompt.trim()) return;
    const newAgent: Agent = {
      id: `custom-${Date.now()}`,
      name: form.name.toLowerCase().replace(/\s+/g, '-'),
      label: form.label,
      icon: '⚡',
      description: form.description,
      systemPrompt: form.systemPrompt,
      recommendedTools: form.recommendedTools,
      isBuiltin: false,
    };
    store.setCustomAgents([...customAgents, newAgent]);
    closeDialog();
  }

  return (
    <>
      <div className="flex flex-col gap-1 px-3 pb-4">
        {allAgents.length === 0 && (
          <div className="text-[11px] text-muted-foreground italic py-1.5">暂无 Agent。</div>
        )}
        {allAgents.map((agent) => {
          const isExpanded = expandedAgentId === agent.id;
          const disabledForAgent = agentDisabledTools[agent.id] ?? [];
          const enabledCount = agent.recommendedTools.filter((t) => !disabledForAgent.includes(t)).length;
          return (
            <div key={agent.id} style={{
              borderRadius: 10, border: '1px solid var(--glass-border)',
              background: 'var(--glass-bg)',
              overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)' }}>
                    {agent.label}{' '}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>@{agent.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{agent.description}</div>
                  {agent.recommendedTools.length > 0 && (
                    <button
                      onClick={() => setExpandedAgentId(isExpanded ? null : agent.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4, color: 'var(--text-muted)', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}
                    >
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                        <polyline points="4,2 8,6 4,10" />
                      </svg>
                      工具 ({enabledCount}/{agent.recommendedTools.length})
                    </button>
                  )}
                </div>
                {!agent.isBuiltin && (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive shrink-0" onClick={() => handleDelete(agent.id)}>删除</Button>
                )}
              </div>
              {isExpanded && agent.recommendedTools.length > 0 && (
                <div style={{ borderTop: '1px solid var(--glass-border)', padding: '6px 10px 8px', paddingLeft: 40, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {agent.recommendedTools.map((toolName) => {
                    const meta = TOOL_META.find((m) => m.name === toolName);
                    const enabled = !disabledForAgent.includes(toolName);
                    return (
                      <div key={toolName}
                        onClick={() => toggleAgentTool(agent.id, toolName)}
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer border transition-colors ${
                          enabled ? 'bg-primary/5 border-primary/20' : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className={`text-xs font-semibold ${enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{meta?.label ?? toolName}</div>
                          {meta?.description && <div className="text-[10.5px] text-muted-foreground mt-0.5">{meta.description}</div>}
                        </div>
                        <Switch size="sm" checked={enabled} onClick={(e: React.MouseEvent) => e.stopPropagation()} onCheckedChange={() => toggleAgentTool(agent.id, toolName)} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Agent Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent aria-describedby={undefined} className="w-[400px] max-h-[80vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
            <DialogTitle className="text-sm">添加 Agent</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 p-4 overflow-y-auto">
            <Input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="显示名称 *"
            />
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="@mention 触发词 (如 browser) *"
            />
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="简短描述"
            />
            <Textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder="System prompt 补充 *"
              className="min-h-[80px] resize-none text-xs"
            />
            <div>
              <div className="text-[11px] text-muted-foreground mb-1.5">推荐工具：</div>
              <div className="flex flex-col gap-1">
                {ALL_TOOL_NAMES.map((toolName) => {
                  const meta = TOOL_META.find((m) => m.name === toolName);
                  const enabled = form.recommendedTools.includes(toolName);
                  return (
                    <div key={toolName}
                      onClick={() => toggleFormTool(toolName)}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer border transition-colors ${
                        enabled ? 'bg-primary/5 border-primary/20' : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-semibold ${enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{meta?.label ?? toolName}</div>
                        {meta?.description && <div className="text-[10.5px] text-muted-foreground mt-0.5">{meta.description}</div>}
                      </div>
                      <Switch size="sm" checked={enabled} onClick={(e: React.MouseEvent) => e.stopPropagation()} onCheckedChange={() => toggleFormTool(toolName)} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
            <Button variant="outline" size="sm" onClick={closeDialog}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name.trim() || !form.label.trim() || !form.systemPrompt.trim()}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
