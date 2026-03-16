import { useState, useEffect } from 'react';
import { loadModels, saveModels, loadDisabledTools, saveDisabledTools, loadMcpServers, saveMcpServers, type ModelConfig, type Provider, PROVIDER_DEFAULTS, type McpServerConfig } from '../../lib/storage';
import type { McpTransportType } from '../../lib/mcp';
import { TOOL_META } from '../../lib/tools';
import { fetchMcpTools, type McpTool } from '../../lib/mcp';

interface Props {
  onClose: () => void;
  onModelsChange: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: 12,
  padding: '8px 10px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
  display: 'block',
};

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

export default function SettingsPanel({ onClose, onModelsChange }: Props) {
  const [tab, setTab] = useState<'models' | 'tools' | 'mcp'>('models');
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [saved, setSaved] = useState(false);
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpSaved, setMcpSaved] = useState<Record<string, boolean>>({});
  const [mcpTools, setMcpTools] = useState<Record<string, McpTool[]>>({});
  const [mcpToolsLoading, setMcpToolsLoading] = useState<Record<string, boolean>>({});
  const [mcpToolsExpanded, setMcpToolsExpanded] = useState<Record<string, boolean>>({});
  const [mcpToolsError, setMcpToolsError] = useState<Record<string, string>>({});

  useEffect(() => {
    loadModels().then(({ models: ms, activeModelId: aid }) => {
      setModels(ms);
      setActiveModelId(aid);
      setSelectedId(ms[0]?.id ?? '');
    });
    loadDisabledTools().then(setDisabledTools);
    loadMcpServers().then(setMcpServers);
  }, []);

  function newMcpServer(): McpServerConfig {
    return { id: Date.now().toString(), name: '', url: '', enabled: true, type: 'http' };
  }

  function updateMcpServer<K extends keyof McpServerConfig>(id: string, field: K, value: McpServerConfig[K]) {
    setMcpServers((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
  }

  async function saveMcpServer(id: string) {
    await saveMcpServers(mcpServers);
    setMcpSaved((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => setMcpSaved((prev) => ({ ...prev, [id]: false })), 1500);
  }

  function deleteMcpServer(id: string) {
    const next = mcpServers.filter((s) => s.id !== id);
    setMcpServers(next);
    saveMcpServers(next);
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
    setDisabledTools((prev) => {
      const next = prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName];
      saveDisabledTools(next);
      return next;
    });
  }

  function toggleTool(name: string) {
    setDisabledTools((prev) => {
      const next = prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name];
      saveDisabledTools(next);
      return next;
    });
  }

  const selected = models.find((m) => m.id === selectedId);

  function updateSelected<K extends keyof ModelConfig>(field: K, value: ModelConfig[K]) {
    setModels((prev) => prev.map((m) => m.id === selectedId ? { ...m, [field]: value } : m));
  }

  function handleProviderChange(provider: Provider) {
    const defaults = PROVIDER_DEFAULTS[provider];
    setModels((prev) => prev.map((m) => m.id === selectedId ? { ...m, provider, baseURL: defaults.baseURL, model: defaults.model } : m));
  }

  function handleAdd() {
    const m = newModel();
    setModels((prev) => [...prev, m]);
    setSelectedId(m.id);
  }

  function handleDelete(id: string) {
    if (models.length <= 1) return;
    const next = models.find((m) => m.id !== id);
    setModels((prev) => prev.filter((m) => m.id !== id));
    setSelectedId(next?.id ?? '');
    if (activeModelId === id) setActiveModelId(next?.id ?? '');
  }

  async function handleSave() {
    await saveModels(models, activeModelId);
    await saveDisabledTools(disabledTools);
    onModelsChange();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 8px' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['models', 'tools', 'mcp'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? 'var(--accent-glass)' : 'none', border: tab === t ? '1px solid var(--accent-glow)' : '1px solid transparent', borderRadius: 8, color: tab === t ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11.5, fontWeight: 600, padding: '3px 10px', cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
          ))}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
      </div>

      {tab === 'mcp' ? (
        <div className="scrollbar-thin" style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mcpServers.map((srv) => (
            <div key={srv.id} className="glass" style={{ borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <input
                  value={srv.name}
                  onChange={(e) => setMcpServers((prev) => prev.map((s) => s.id === srv.id ? { ...s, name: e.target.value } : s))}
                  placeholder="Server name"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div
                  onClick={() => setMcpServers((prev) => prev.map((s) => s.id === srv.id ? { ...s, enabled: !s.enabled } : s))}
                  style={{ width: 32, height: 18, borderRadius: 9, background: srv.enabled ? 'var(--accent)' : 'rgba(120,120,128,0.3)', flexShrink: 0, position: 'relative', transition: 'background 0.15s', cursor: 'pointer' }}
                >
                  <div style={{ position: 'absolute', top: 2, left: srv.enabled ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                </div>
              </div>
              <input
                value={srv.url}
                onChange={(e) => setMcpServers((prev) => prev.map((s) => s.id === srv.id ? { ...s, url: e.target.value } : s))}
                placeholder="http://localhost:3000/mcp"
                style={inputStyle}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={labelStyle}>Type</span>
                <select
                  value={srv.type ?? 'http'}
                  onChange={(e) => setMcpServers((prev) => prev.map((s) => s.id === srv.id ? { ...s, type: e.target.value as McpTransportType } : s))}
                  style={{ ...selectStyle, flex: 1, fontSize: 11 }}
                >
                  <option value="http">HTTP (JSON-RPC)</option>
                  <option value="streamable-http">Streamable HTTP</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => {
                    saveMcpServers(mcpServers);
                    setMcpSaved((prev) => ({ ...prev, [srv.id]: true }));
                    setTimeout(() => setMcpSaved((prev) => ({ ...prev, [srv.id]: false })), 1500);
                  }}
                  style={{ padding: '4px 12px', borderRadius: 8, border: mcpSaved[srv.id] ? '1px solid rgba(52,199,89,0.5)' : '1px solid var(--accent-glow)', background: mcpSaved[srv.id] ? 'rgba(52,199,89,0.15)' : 'var(--accent-glass)', color: mcpSaved[srv.id] ? 'rgba(52,199,89,0.9)' : 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >{mcpSaved[srv.id] ? 'Saved ✓' : 'Save'}</button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => refreshMcpTools(srv)}
                    disabled={mcpToolsLoading[srv.id]}
                    style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--glass-bg)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: mcpToolsLoading[srv.id] ? 0.6 : 1 }}
                  >{mcpToolsLoading[srv.id] ? '...' : '↻ 刷新工具'}</button>
                  {mcpTools[srv.id] && (
                    <button
                      onClick={() => setMcpToolsExpanded((prev) => ({ ...prev, [srv.id]: !prev[srv.id] }))}
                      style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: mcpToolsExpanded[srv.id] ? 'var(--accent-glass)' : 'var(--glass-bg)', color: mcpToolsExpanded[srv.id] ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                    >{mcpToolsExpanded[srv.id] ? '▲ 工具列表' : `▼ 工具列表 (${mcpTools[srv.id].length})`}</button>
                  )}
                  <button
                    onClick={() => deleteMcpServer(srv.id)}
                    style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.08)', color: '#ff3b30', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >删除</button>
                </div>
              </div>
              {mcpToolsError[srv.id] && (
                <div style={{ fontSize: 11, color: '#ff3b30', padding: '4px 6px', background: 'rgba(255,59,48,0.08)', borderRadius: 6 }}>{mcpToolsError[srv.id]}</div>
              )}
              {mcpToolsExpanded[srv.id] && mcpTools[srv.id] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>工具列表 — 点击开启/关闭</div>
                  {mcpTools[srv.id].map((tool) => {
                    const enabled = !disabledTools.includes(tool.name);
                    return (
                      <div
                        key={tool.name}
                        onClick={() => toggleMcpTool(tool.name)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: enabled ? 'var(--accent-glass)' : 'transparent', border: `1px solid ${enabled ? 'var(--accent-glow)' : 'var(--border-subtle)'}` }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>{tool.originalName}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.description}</div>
                        </div>
                        <div style={{ width: 28, height: 16, borderRadius: 8, background: enabled ? 'var(--accent)' : 'rgba(120,120,128,0.3)', flexShrink: 0, position: 'relative', transition: 'background 0.15s' }}>
                          <div style={{ position: 'absolute', top: 2, left: enabled ? 12 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <button
            onClick={() => setMcpServers((prev) => [...prev, { id: Date.now().toString(), name: 'My MCP Server', url: '', enabled: true }])}
            style={{ width: '100%', background: 'var(--accent-glass)', border: '1px solid var(--accent-glow)', borderRadius: 8, color: 'var(--accent)', fontSize: 11, fontWeight: 600, padding: '6px 0', cursor: 'pointer' }}
          >+ Add Server</button>
        </div>
      ) : tab === 'tools' ? (
        <div className="scrollbar-thin" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TOOL_META.map((tool) => {
            const enabled = !disabledTools.includes(tool.name);
            return (
              <div key={tool.name} onClick={() => toggleTool(tool.name)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', background: enabled ? 'var(--accent-glass)' : 'transparent', border: `1px solid ${enabled ? 'var(--accent-glow)' : 'var(--border-subtle)'}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>{tool.label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 1 }}>{tool.description}</div>
                </div>
                <div style={{ width: 32, height: 18, borderRadius: 9, background: enabled ? 'var(--accent)' : 'rgba(120,120,128,0.3)', flexShrink: 0, position: 'relative', transition: 'background 0.15s' }}>
                  <div style={{ position: 'absolute', top: 2, left: enabled ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', gap: 0 }}>
        {/* Left: model list */}
        <div style={{ width: 130, borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="scrollbar-thin" style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
            {models.map((m) => (
              <div
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                style={{
                  padding: '7px 8px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: selectedId === m.id ? 'var(--accent-glass)' : 'transparent',
                  border: selectedId === m.id ? '1px solid var(--accent-glow)' : '1px solid transparent',
                  marginBottom: 3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{m.provider}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={handleAdd}
              style={{ width: '100%', background: 'var(--accent-glass)', border: '1px solid var(--accent-glow)', borderRadius: 8, color: 'var(--accent)', fontSize: 11, fontWeight: 600, padding: '5px 0', cursor: 'pointer' }}
            >+ Add</button>
          </div>
        </div>

        {/* Right: edit panel */}
        <div className="scrollbar-thin" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selected ? (
            <>
              <div>
                <label style={labelStyle}>Name</label>
                <input style={inputStyle} value={selected.name} onChange={(e) => updateSelected('name', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Provider</label>
                <select style={selectStyle} value={selected.provider} onChange={(e) => handleProviderChange(e.target.value as Provider)}>
                  {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {selected.provider !== 'ollama' && (
                <div>
                  <label style={labelStyle}>API Key</label>
                  <input style={inputStyle} type="password" value={selected.apiKey} placeholder={PROVIDER_DEFAULTS[selected.provider].placeholder} onChange={(e) => updateSelected('apiKey', e.target.value)} />
                </div>
              )}
              <div>
                <label style={labelStyle}>Base URL</label>
                <input style={inputStyle} value={selected.baseURL} onChange={(e) => updateSelected('baseURL', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Model</label>
                <input style={inputStyle} value={selected.model} onChange={(e) => updateSelected('model', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleSave}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 10, border: saved ? '1px solid rgba(52,199,89,0.5)' : '1px solid var(--accent-glow)', background: saved ? 'rgba(52,199,89,0.85)' : 'var(--accent)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  {saved ? 'Saved ✓' : 'Save'}
                </button>
                {models.length > 1 && (
                  <button
                    onClick={() => handleDelete(selected.id)}
                    style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.08)', color: '#ff3b30', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                  >Delete</button>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', marginTop: 24 }}>Select a model</div>
          )}
        </div>
      </div>
      )} {/* end tab ternary */}

    </div>
  );
}
