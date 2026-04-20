'use client';

import { Bell, Search } from 'lucide-react';
import type { UserPrincipal } from '@hq/auth/types';

interface Props {
  principal: UserPrincipal;
}

export function TopBar({ principal }: Props) {
  const displayName = principal.email.split('@')[0] ?? principal.email;
  const initial = displayName[0]?.toUpperCase() ?? '?';

  return (
    <header className="hidden md:flex h-11 shrink-0 items-center border-b border-[#e6e8eb] bg-white px-4 gap-3 sticky top-0 z-30">
      {/* Search trigger */}
      <button
        type="button"
        aria-label="Search (⌘K)"
        className="flex h-7 min-w-[200px] items-center gap-2 rounded-md border border-[#e6e8eb] bg-[#fafbfb] px-2.5 text-[11.5px] text-[#8a8f98] hover:border-[#d0d6e0] hover:text-[#62666d] transition-colors duration-100"
      >
        <Search size={11} />
        <span>Search…</span>
        <div className="flex-1" />
        <kbd className="text-[10px] font-medium text-[#8a8f98] bg-white border border-[#e6e8eb] rounded px-1 py-[1px]">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* Notification bell */}
      <button
        type="button"
        aria-label="Notifications"
        className="relative flex h-7 w-7 items-center justify-center rounded text-[#62666d] hover:bg-[#f3f4f5] hover:text-[#0f1011] transition-colors duration-100"
      >
        <Bell size={13} />
      </button>

      {/* User avatar + name */}
      <button
        type="button"
        aria-label="Account"
        className="flex items-center gap-1.5 h-7 px-1.5 rounded text-[#3d4149] hover:bg-[#f3f4f5] transition-colors duration-100"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal text-[9px] font-semibold text-white shrink-0">
          {initial}
        </span>
        <span className="text-[11.5px] font-medium">{displayName}</span>
      </button>
    </header>
  );
}
