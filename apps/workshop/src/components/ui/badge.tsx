import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// Badge — Linear/Attio style. Default is a subtle tinted chip. For status,
// prefer `<StatusDot>` (dot + medium text, no pill) over a filled badge.

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'danger' | 'warn' | 'teal' | 'blue' | 'indigo';
}

const toneStyles: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-[#f3f4f5] text-[#3d4149]',
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-red-50 text-red-700',
  warn: 'bg-amber-50 text-amber-700',
  teal: 'bg-brand-teal-tint text-brand-teal-dark',
  blue: 'bg-sky-50 text-sky-700',
  indigo: 'bg-[#f3f0ff] text-[#5e6ad2]',
};

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] items-center rounded px-1.5 text-[11px] font-medium tabular-nums leading-none',
        toneStyles[tone],
        className
      )}
      {...props}
    />
  );
}

// StatusDot — Linear status pattern: colored dot + medium-weight text.
// Use this for row/cell status, never a filled pill.
interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'danger' | 'warn' | 'brand' | 'indigo';
  label: string;
}

const dotStyles: Record<NonNullable<StatusDotProps['tone']>, string> = {
  neutral: 'bg-[#8a8f98]',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
  warn: 'bg-amber-500',
  brand: 'bg-brand-teal',
  indigo: 'bg-[#5e6ad2]',
};

export function StatusDot({ tone = 'neutral', label, className, ...props }: StatusDotProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#3d4149]', className)}
      {...props}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotStyles[tone])} />
      {label}
    </span>
  );
}
