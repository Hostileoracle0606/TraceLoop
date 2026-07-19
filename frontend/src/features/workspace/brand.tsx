import { Sparkles } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="TraceLoop — Cursor for Hardware">
      <span className="brand__mark"><Sparkles size={16} strokeWidth={1.8} /></span>
      {!compact && (
        <span className="brand__wordmark">
          <strong>TraceLoop</strong>
          <small>Cursor for Hardware</small>
        </span>
      )}
    </div>
  );
}
