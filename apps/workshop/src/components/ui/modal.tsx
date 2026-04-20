'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

interface ModalProps {
  trigger: string;
  title: string;
  children: ReactNode;
  // Optional controlled mode — when provided, the parent owns open state
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Modal({ trigger, title, children, open: controlledOpen, onOpenChange }: ModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (value: boolean) => {
    if (isControlled) {
      onOpenChange?.(value);
    } else {
      setInternalOpen(value);
    }
  };

  useEffect(() => {
    if (!open) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        + {trigger}
      </Button>

      {open ? (
        <div
          className="absolute inset-0 z-50 flex items-start justify-center"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Dialog — full screen on mobile, centered card on desktop */}
          <div
            className={cn(
              'relative z-10 flex max-w-full flex-col overflow-hidden bg-[#ffffff]',
              'h-full w-full',
              'sm:mt-[10vh] sm:h-auto sm:max-h-[80vh] sm:w-full sm:max-w-lg sm:rounded-[12px] sm:border sm:border-[#e6e8eb] sm:shadow-lg'
            )}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[#e6e8eb] px-4 py-3 sm:px-5">
              <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight sm:text-[18px]">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[#62666d] transition-colors hover:bg-[var(--app-bg)] hover:text-[#0f1011]"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
              {children}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
