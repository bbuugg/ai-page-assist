interface Props {
  isSelecting: boolean;
  isEditing: boolean;
  onToggleSelect: () => void;
  onToggleEdit: () => void;
  onCaptureFull: () => void;
}

const btnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 14px',
  borderRadius: '10px',
  fontSize: '12px',
  fontWeight: 500,
  border: '1px solid var(--border-input)',
  cursor: 'pointer',
  transition: 'all 0.15s',
  background: 'var(--bg-btn)',
  color: 'var(--text-secondary)',
};

const btnActive: React.CSSProperties = {
  background: 'rgba(10,132,255,0.25)',
  border: '1px solid rgba(10,132,255,0.5)',
  color: '#0a84ff',
};

export default function Toolbar({ isSelecting, isEditing, onToggleSelect, onToggleEdit, onCaptureFull }: Props) {
  return (
    <div style={{ display: 'flex', gap: '8px', padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
      <button onClick={onToggleSelect} title="Select Element" style={isSelecting ? { ...btnBase, ...btnActive } : btnBase}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
        </svg>
        Select
      </button>

      <button onClick={onToggleEdit} title="Edit Text" style={isEditing ? { ...btnBase, ...btnActive } : btnBase}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit Text
      </button>

      <button onClick={onCaptureFull} title="Full Page HTML" style={btnBase}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
        Full Page
      </button>
    </div>
  );
}
