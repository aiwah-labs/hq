import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type AlertTone = 'success' | 'danger' | 'info';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
}

const toneStyles: Record<AlertTone, string> = {
  success: 'border-emerald-200/55 bg-emerald-50/70 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-950/25 dark:text-emerald-200',
  danger: 'border-red-200/55 bg-red-50/70 text-red-700 dark:border-red-700/40 dark:bg-red-950/25 dark:text-red-200',
  info: 'border-sky-200/55 bg-sky-50/70 text-sky-700 dark:border-sky-700/40 dark:bg-sky-950/25 dark:text-sky-200',
};

export function Alert({ tone = 'info', className, ...props }: AlertProps) {
  return (
    <div
      className={cn(
        'rounded-[6px] border px-3 py-2 text-[13px] font-medium',
        toneStyles[tone],
        className
      )}
      {...props}
    />
  );
}
