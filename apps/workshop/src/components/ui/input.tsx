import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type InputSize = 'sm' | 'md';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
}

const sizeStyles: Record<InputSize, string> = {
  sm: 'h-8 text-[13px]',
  md: 'h-9 text-[13px]',
};

export function Input({ className, size = 'sm', ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full rounded-[6px] border border-divider bg-[#ffffff] px-2.5 text-[13px] text-[#0f1011] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
        'placeholder:text-mist focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20',
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}
