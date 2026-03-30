'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TabListProps {
  children: ReactNode;
  className?: string;
}

export function TabList({ children, className }: TabListProps) {
  return (
    <div
      className={cn(
        'flex gap-0 overflow-x-auto border-b border-divider scrollbar-none',
        className
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

interface TabProps {
  value: string;
  activeTab: string;
  onClick: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tab({ value, activeTab, onClick, children, className }: TabProps) {
  const isActive = value === activeTab;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onClick(value)}
      className={cn(
        'relative shrink-0 px-3 py-2 text-[13px] font-medium transition-colors whitespace-nowrap',
        isActive
          ? 'text-brand-teal-dark after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-brand-teal after:content-[""]'
          : 'text-[var(--app-muted)] hover:text-[var(--app-fg)]',
        className
      )}
    >
      {children}
    </button>
  );
}

interface TabPanelProps {
  value: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ value, activeTab, children, className }: TabPanelProps) {
  if (value !== activeTab) return null;

  return (
    <div role="tabpanel" className={cn(className)}>
      {children}
    </div>
  );
}
