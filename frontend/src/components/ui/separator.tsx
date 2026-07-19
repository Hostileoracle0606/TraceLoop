import { cn } from '../../lib/utils';

export function Separator({ className, orientation = 'horizontal' }: { className?: string; orientation?: 'horizontal' | 'vertical' }) {
  return <div aria-hidden="true" className={cn('ui-separator', `ui-separator--${orientation}`, className)} />;
}
