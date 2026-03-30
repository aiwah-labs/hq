import type { LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-[12px] font-medium text-[var(--app-muted)]', className)}
      {...props}
    />
  );
}
