'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface SectionTabItem {
  value: string;
  label: string;
  href: string;
  disabled?: boolean;
}

interface SectionTabsNavProps {
  items: SectionTabItem[];
  active: string;
  ariaLabel: string;
  className?: string;
}

export function SectionTabsNav({ items, active, ariaLabel, className }: SectionTabsNavProps) {
  return (
    <div className={cn('relative border-b border-divider', className)}>
      <nav className="flex gap-0 overflow-x-auto scrollbar-none -mb-px" role="tablist" aria-label={ariaLabel}>
        {items.map((item) => {
          const isActive = item.value === active;

          if (item.disabled) {
            return (
              <span
                key={item.value}
                className="relative inline-flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-muted/60"
              >
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.value}
              href={item.href}
              role="tab"
              aria-current={isActive ? 'page' : undefined}
              aria-selected={isActive}
              className={cn(
                'relative inline-flex shrink-0 select-none items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-[13px] font-medium outline-none transition-colors',
                isActive
                  ? 'text-brand-teal after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-t-full after:bg-brand-teal after:content-[""]'
                  : 'text-muted hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
