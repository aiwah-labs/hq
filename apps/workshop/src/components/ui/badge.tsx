import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'danger' | 'teal' | 'blue';
}

const toneStyles: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-700/60 dark:bg-red-950/40 dark:text-red-200',
  teal: 'border-brand-teal/20 bg-brand-teal/10 text-brand-teal-dark dark:border-brand-teal/40 dark:bg-brand-teal/20 dark:text-brand-teal-tint',
  blue: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-200',
};

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium tracking-normal',
        toneStyles[tone],
        className
      )}
      {...props}
    />
  );
}
