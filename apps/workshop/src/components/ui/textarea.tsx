import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-[6px] border border-divider bg-[var(--app-input-bg)] px-2.5 py-2 text-[13px] text-[var(--app-fg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
        'placeholder:text-mist focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20',
        className
      )}
      {...props}
    />
  );
}
