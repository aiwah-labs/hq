import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type SelectSize = 'sm' | 'md';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: SelectSize;
}

const sizeStyles: Record<SelectSize, string> = {
  sm: 'h-8 text-[13px]',
  md: 'h-9 text-[13px]',
};

export function Select({ className, size = 'sm', ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'w-full appearance-none rounded-[6px] border border-divider bg-[var(--app-input-bg)] px-2.5 text-[13px] text-[var(--app-fg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
        "bg-[length:12px] bg-[position:right_10px_center] bg-no-repeat pr-7",
        "[background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2364748B%22%3E%3Cpath fill-rule=%22evenodd%22 d=%22M5.23 7.21a.75.75 0 011.06.02L10 11.144l3.71-3.914a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z%22 clip-rule=%22evenodd%22/%3E%3C/svg%3E')]",
        'focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20',
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}
