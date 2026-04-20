import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Field({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-0.5', className)} {...props} />;
}

export function FieldHint({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[12px] text-[#62666d]', className)} {...props} />;
}

export function FieldError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[12px] text-red-600', className)} {...props} />;
}
