import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// Button — ui-design skill rules:
// - Primary (brand colour) appears at most ONCE per screen.
// - Prefer outline/ghost for all secondary actions.
// - loading=true: replaces leading icon with spinner, keeps width stable, auto-disables.
// - active/pressed: scale-[0.98] — no pushed-in shadow.
// - focus-visible: ring-2 with teal/40, never removed.
// - disabled: opacity-50, cursor-not-allowed, pointer-events-none.

type ButtonVariant = 'primary' | 'outline' | 'secondary' | 'ghost' | 'subtle' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[#009E85] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] hover:bg-[#007A66] active:scale-[0.98]',
  outline:
    'border border-[#e6e8eb] bg-white text-[#3d4149] hover:bg-[#fafbfb] hover:border-[#d0d6e0] active:scale-[0.98]',
  secondary: 'bg-[#f3f4f5] text-[#3d4149] hover:bg-[#e6e8eb] active:scale-[0.98]',
  ghost: 'text-[#62666d] hover:bg-[#f3f4f5] hover:text-[#0f1011] active:scale-[0.98]',
  subtle: 'bg-[#fafbfb] text-[#62666d] hover:bg-[#f3f4f5] hover:text-[#0f1011] active:scale-[0.98]',
  danger: 'bg-[#dc2626] text-white hover:bg-[#b91c1c] active:scale-[0.98]',
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-[12px]',
  sm: 'h-8 px-3 text-[12.5px]',
  md: 'h-9 px-3.5 text-[13px]',
};

// Spinner sizes matched to button sizes
const spinnerSizes: Record<ButtonSize, number> = { xs: 11, sm: 12, md: 13 };

export function Button({
  variant = 'outline',
  size = 'sm',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium leading-none',
        'transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009E85]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <Spinner size={spinnerSizes[size]} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

function Spinner({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="6"
        cy="6"
        r="4.5"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      <path
        d="M6 1.5A4.5 4.5 0 0 1 10.5 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
