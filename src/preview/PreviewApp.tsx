import { useState, useEffect, useRef, useCallback } from 'react';
import { loadPreviewHtml } from '../lib/storage';

type ViewMode = 'code' | 'split' | 'preview';

const SEGMENTS: { value: ViewMode; label: string }[] = [
  { value: 'code', label: '代码' },
  { value: 'split', label: '分栏' },
  { value: 'preview', label: '预览' },
];

function openRenderTab(html: string) {
  chrome.runtime.sendMessage({ action: 'openRenderTab', html });
}

export default function PreviewApp() {
  const [html, setHtml] = useState('');
  const [editorHtml, setEditorHtml] = useState('');
  const [mode, setMode] = useState<ViewMode>('split');
  const [copied, setCopied] = useState(false);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function copyHtml() {
    navigator.clipboard.writeText(editorHtml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  useEffect(() => {
    loadPreviewHtml().then((h) => {
      setHtml(h);
      setEditorHtml(h);
    });
  }, []);

  useEffect(() => {
    function onChanged(changes: Record<string, chrome.storage.StorageChange>) {
      if (changes.previewHtml) {
        const next = changes.previewHtml.newValue ?? '';
        setHtml(next);
        setEditorHtml(next);
      }
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const handleEditorChange = useCallback((value: string) => {
    setEditorHtml(value);
    if (throttleTimer.current) clearTimeout(throttleTimer.current);
    throttleTimer.current = setTimeout(() => setHtml(value), 300);
  }, []);

  const showCode = mode === 'code' || mode === 'split';
  const showPreview = mode === 'preview' || mode === 'split';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--background)', color: 'var(--foreground)', fontFamily: 'inherit' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>预览</span>

        {/* Segmented control */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--muted)', borderRadius: 8, padding: 3, gap: 2 }}>
          {SEGMENTS.map((seg) => (
            <button
              key={seg.value}
              onClick={() => setMode(seg.value)}
              style={{
                fontSize: 11, fontWeight: mode === seg.value ? 600 : 400,
                padding: '3px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: mode === seg.value ? 'var(--background)' : 'transparent',
                color: mode === seg.value ? 'var(--foreground)' : 'var(--muted-foreground)',
                boxShadow: mode === seg.value ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {seg.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => openRenderTab(editorHtml)}
          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', color: 'var(--foreground)', flexShrink: 0 }}
        >
          在新标签打开
        </button>
      </div>

      {/* Main area */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Code editor */}
        {showCode && (
          <div style={{
            flex: mode === 'split' ? '0 0 30%' : '1 1 100%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: mode === 'split' ? '1px solid var(--border)' : 'none',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 8px', borderBottom: '1px solid var(--border)', background: 'var(--muted)', flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'ui-monospace,monospace' }}>HTML</span>
              <button
                onClick={copyHtml}
                style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', color: 'var(--foreground)' }}
              >
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <textarea
              value={editorHtml}
              onChange={(e) => handleEditorChange(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, resize: 'none', border: 'none', outline: 'none',
                padding: '10px 12px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12, lineHeight: 1.6,
                background: 'var(--muted)', color: 'var(--foreground)',
                whiteSpace: 'pre', overflowWrap: 'normal',
                overflowX: 'auto', overflowY: 'auto',
                width: '100%', boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Preview placeholder */}
        {showPreview && (
          <div
            style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', background: '#f8f8f8' }}
          >
            <iframe
              srcDoc={html}
              sandbox="allow-scripts allow-same-origin"
              style={{ flex: 1, border: 'none', width: '100%' }}
              title="preview"
            />
            {/* Transparent overlay to block clicks but allow scroll events to pass through */}
            <div
              style={{ position: 'absolute', inset: 0, zIndex: 1 }}
              onWheel={(e) => {
                const iframe = e.currentTarget.previousElementSibling as HTMLIFrameElement;
                try {
                  iframe.contentWindow?.scrollBy({ top: e.deltaY, left: e.deltaX });
                } catch { /* cross-origin fallback */ }
              }}
            />
            {/* Fixed hint button at bottom-right */}
            <button
              onClick={() => openRenderTab(editorHtml)}
              title="在新标签页中打开以完整体验 JS 交互效果"
              style={{
                position: 'absolute', bottom: 10, right: 10, zIndex: 2,
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: 'rgba(0,0,0,0.55)', color: '#fff',
                fontSize: 11, lineHeight: 1, backdropFilter: 'blur(4px)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              完整体验
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
