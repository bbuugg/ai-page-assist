import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Props {
  isSelecting: boolean;
  isEditing: boolean;
  onToggleSelect: () => void;
  onToggleEdit: () => void;
  onCaptureFull: () => void;
}

export default function Toolbar({ isSelecting, isEditing, onToggleSelect, onToggleEdit, onCaptureFull }: Props) {
  return (
    <div className="flex gap-2 px-4 py-2.5 border-b border-border shrink-0">
      <Button
        variant={isSelecting ? 'secondary' : 'outline'}
        size="sm"
        onClick={onToggleSelect}
        title="选择元素"
        className={cn('gap-1.5 text-xs', isSelecting && 'bg-primary/10 text-primary border-primary/30')}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
        </svg>
        选择
      </Button>

      <Button
        variant={isEditing ? 'secondary' : 'outline'}
        size="sm"
        onClick={onToggleEdit}
        title="编辑文字"
        className={cn('gap-1.5 text-xs', isEditing && 'bg-primary/10 text-primary border-primary/30')}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        编辑文字
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onCaptureFull}
        title="整页 HTML"
        className="gap-1.5 text-xs"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
        整页
      </Button>
    </div>
  );
}
