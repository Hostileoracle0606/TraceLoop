import React, { useEffect, useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

const toastVariants = cva(
  'flex items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-lg transition-all',
  {
    variants: {
      variant: {
        default: 'bg-white text-gray-900 border border-gray-200',
        success: 'bg-green-50 text-green-800 border border-green-200',
        error: 'bg-red-50 text-red-800 border border-red-200',
        warning: 'bg-amber-50 text-amber-800 border border-amber-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface ToastProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  duration?: number;
  onDismiss?: () => void;
}

function Toast({
  className,
  variant,
  duration = 5000,
  onDismiss,
  children,
  ...props
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  if (!visible) return null;

  return (
    <div
      className={cn(toastVariants({ variant }), className)}
      role="alert"
      {...props}
    >
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          onClick={() => {
            setVisible(false);
            onDismiss();
          }}
          className="shrink-0 rounded p-1 hover:bg-black/5"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export { Toast, toastVariants };
