import { useState, useRef } from 'react';
import type { ElementData, ChatMessage } from '../App';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  data: ElementData;
  onClose: () => void;
  onSave: (contentType: 'html' | 'css', value: string) => void;
  addMessage: (role: ChatMessage['role'], text: string) => void;
}

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
    <div className="mx-3 mt-2.5 mb-1 rounded-2xl border border-border bg-card flex flex-col shrink-0 max-h-60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex gap-1 items-center">
          {(['html', 'css'] as const).map((t) => (
            <Button
              key={t}
              variant={tab === t ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTab(t)}
              className="h-6 text-[11px] px-3"
            >
              {t.toUpperCase()}
            </Button>
          ))}
          <span className="text-[11px] text-muted-foreground ml-1.5">{charCount} chars</span>
        </div>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" onClick={handleCopy} title="复制" className="h-6 w-6">
            {copied
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            }
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSave} title="应用到页面" className="h-6 w-6">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} title="关闭" className="h-6 w-6">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </Button>
        </div>
      </div>
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={currentValue}
        onChange={(e) => tab === 'html' ? setHtmlValue(e.target.value) : setCssValue(e.target.value)}
        spellCheck={false}
        className={cn('flex-1 resize-none bg-transparent border-none outline-none text-foreground text-[11px] font-mono leading-relaxed p-3 overflow-y-auto')}
      />
    </div>
  );
}
