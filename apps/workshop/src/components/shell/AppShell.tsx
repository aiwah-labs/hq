'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { UserPrincipal } from '@hq/auth/types';
import { MobileHeader } from './MobileHeader';
import { Sidebar } from './Sidebar';

interface Props {
  principal: UserPrincipal;
  children: React.ReactNode;
}

export function AppShell({ principal, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-full w-full overflow-x-hidden">
      <Sidebar
        principal={principal}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col h-full overflow-y-auto bg-[var(--app-bg)]">
        <MobileHeader onMenuToggle={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 overflow-x-hidden px-6 py-5 sm:px-8 sm:py-6 enter-surface">
          {children}
        </main>
      </div>
    </div>
  );
}
