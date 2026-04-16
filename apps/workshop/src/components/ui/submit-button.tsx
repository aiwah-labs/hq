'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/cn';

export function SubmitButton({ children, className, disabled, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className={cn(pending && 'cursor-wait opacity-70', className)}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" size={14} />}
      {children}
    </Button>
  );
}
