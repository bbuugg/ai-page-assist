import { useState, useRef } from 'react';
import type { ElementData, ChatMessage } from '../App';

interface Props {
  data: ElementData;
  onClose: () => void;
  onSave: (contentType: 'html' | 'css', value: string) => void;
  addMessage: (role: ChatMessage['role'], text: string) => void;
}

const iconBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-system)',
  cursor: 'pointer',
  transition: 'background 0.15s, color 0.15s',
};

export default function HtmlPreview({ data, onClose, onSave, addMessage }: Props) {
  const [tab, setTab] = useState<'html' | 'css'>('html');
  const [htmlValue, setHtmlValue] = useState(data.html);
  const [cssValue, setCssValue] = useState(data.css);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentValue = tab === 'html' ? htmlValue : cssValue;
  const charCount = currentValue.length;

  function handleCopy() {
    navigator.clipboard.writeText(currentValue).then(() => {
      setCopied(true);
      addMessage('system', 'Copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleSave() {
    onSave(tab, currentValue);
  }

  return (
    <div style={{
      margin: '10px 12px 4px',
      borderRadius: 16,
      border: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      backdropFilter: 'blur(25px) saturate(180%)',
      WebkitBackdropFilter: 'blur(25px) saturate(180%)',
      boxShadow: '0 8px 32px var(--shadow), inset 0 1px 0 var(--inset-highlight)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      maxHeight: 240,
      overflow: 'hidden',
      animation: 'ai-slide-up 0.25s cubic-bezier(0.16,1,0.3,1)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['html', 'css'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '4px 12px',
              borderRadius: 8,
              border: 'none',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: tab === t ? 'var(--bg-btn)' : 'transparent',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>
              {t.toUpperCase()}
            </button>
          ))}
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6, alignSelf: 'center' }}>{charCount} chars</span>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={handleCopy} title="Copy" style={iconBtn}>
            {copied
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            }
          </button>
          <button onClick={handleSave} title="Apply to page" style={iconBtn}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </button>
          <button onClick={onClose} title="Close" style={iconBtn}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={currentValue}
        onChange={(e) => tab === 'html' ? setHtmlValue(e.target.value) : setCssValue(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          resize: 'none',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-assistant)',
          fontSize: 11,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          lineHeight: 1.6,
          padding: '10px 12px',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.2) transparent',
        }}
      />
    </div>
  );
}
