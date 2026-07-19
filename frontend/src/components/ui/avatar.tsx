import * as React from 'react';
import { cn } from '../../lib/utils';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  fallback: string;
  tone?: 'agent' | 'user' | 'system';
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, fallback, tone = 'system', ...props }, ref) => (
    <div ref={ref} className={cn('ui-avatar', `ui-avatar--${tone}`, className)} {...props}>
      {fallback}
    </div>
  ),
);
Avatar.displayName = 'Avatar';

export { Avatar };
