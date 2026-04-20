'use client';

import Image from 'next/image';
import { APP_ICON } from '@/config/brand';

interface Props {
  onMenuToggle: () => void;
}

export function MobileHeader({ onMenuToggle }: Props) {
  return (
    <header className="sidebar-surface sticky top-0 z-40 flex h-12 items-center border-b border-[var(--sidebar-border)] px-3 md:hidden">
      <button
        type="button"
        onClick={onMenuToggle}
        className="flex h-8 w-8 items-center justify-center rounded-[5px] text-[var(--sidebar-secondary)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-fg)]"
        aria-label="Open menu"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[#0f1011]">
            <Image src={APP_ICON} alt="" width={14} height={14} priority />
          </div>
          <p className="font-wordmark text-[13px] font-light uppercase tracking-[0.1em] text-[var(--sidebar-fg)]">
            Workshop
          </p>
        </div>
      </div>

      <div className="w-8" />
    </header>
  );
}
