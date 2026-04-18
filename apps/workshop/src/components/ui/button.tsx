import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// Button — follows ui-design skill. Primary is Aiwah teal and should appear
// at most once per screen. Prefer outline/ghost for everything else.

type ButtonVariant = 'primary' | 'outline' | 'secondary' | 'ghost' | 'subtle' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-teal text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] hover:bg-brand-teal-dark',
  outline:
    'border border-[#e6e8eb] bg-white text-[#3d4149] hover:bg-[#fafbfb] hover:border-[#d0d6e0]',
  secondary:
    'bg-[#f3f4f5] text-[#3d4149] hover:bg-[#e6e8eb]',
  ghost:
    'text-[#62666d] hover:bg-[#f3f4f5] hover:text-[#0f1011]',
  subtle:
    'bg-[#fafbfb] text-[#62666d] hover:bg-[#f3f4f5] hover:text-[#0f1011]',
  danger:
    'bg-[#dc2626] text-white hover:bg-[#b91c1c]',
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-[12px]',
  sm: 'h-8 px-3 text-[12.5px]',
  md: 'h-9 px-3.5 text-[13px]',
};

export function Button({ variant = 'outline', size = 'sm', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium leading-none transition-colors',
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
