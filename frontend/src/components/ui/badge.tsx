import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva('ui-badge', {
  variants: {
    tone: {
      neutral: 'ui-badge--neutral',
      blue: 'ui-badge--blue',
      green: 'ui-badge--green',
      amber: 'ui-badge--amber',
      red: 'ui-badge--red',
      violet: 'ui-badge--violet',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />
  ),
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
