'use client';

import Image from 'next/image';

interface Props {
  onMenuToggle: () => void;
}

export function MobileHeader({ onMenuToggle }: Props) {
  return (
    <header className="sidebar-surface sticky top-0 z-40 flex h-12 items-center border-b px-3 md:hidden">
      <button
        type="button"
        onClick={onMenuToggle}
        className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--sidebar-fg)] transition-colors hover:bg-white/10"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-white/10 ring-1 ring-white/15">
            <Image src="/assets/brand/logo-icon.svg" alt="Aiwah logo" width={16} height={16} priority />
          </div>
          <p className="font-wordmark text-[13px] font-light uppercase tracking-[0.12em] text-[var(--sidebar-fg)]">
            WORKSHOP
          </p>
        </div>
      </div>

      {/* Spacer to balance the hamburger button */}
      <div className="w-8" />
    </header>
  );
}
