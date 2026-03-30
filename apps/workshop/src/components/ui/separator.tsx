import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Separator({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('border-0 border-b border-divider', className)} {...props} />;
}
