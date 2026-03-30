import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'xs' | 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'border border-brand-teal bg-brand-teal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:border-brand-teal-dark hover:bg-brand-teal-dark',
  secondary:
    'border border-divider bg-[var(--app-bg-elevated)] text-[var(--app-fg)] hover:bg-[var(--app-input-bg)]',
  ghost: 'border border-transparent bg-transparent text-[var(--app-fg)] hover:border-divider hover:bg-[var(--app-input-bg)]',
  subtle: 'border border-divider bg-[var(--app-input-bg)] text-[var(--app-muted)] hover:text-[var(--app-fg)]',
  danger: 'border border-red-600 bg-red-600 text-white hover:border-red-700 hover:bg-red-700',
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-[12px]',
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-3.5 text-[13px]',
};

export function Button({ variant = 'primary', size = 'sm', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] font-medium leading-none transition-[background-color,border-color,color,box-shadow]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--app-bg)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}
