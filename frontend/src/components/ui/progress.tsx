import { cn } from '../../lib/utils';

export function Progress({ value, className }: { value: number; className?: string }) {
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('ui-progress', className)} role="progressbar" aria-valuenow={safeValue} aria-valuemin={0} aria-valuemax={100}>
      <div className="ui-progress__bar" style={{ width: `${safeValue}%` }} />
    </div>
  );
}
