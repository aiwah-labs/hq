'use client';

import { useState, type ReactNode } from 'react';
import { Button } from './button';

interface CollapsibleSectionProps {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({ label, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      {!open ? (
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          + {label}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[12px] text-[var(--app-muted)] hover:text-[var(--app-fg)] transition-colors"
            >
              Cancel
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
