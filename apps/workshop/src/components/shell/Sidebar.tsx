'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, Bot, Users, Settings, MessageSquare, Cpu, Workflow, NotebookPen, LayoutGrid, ShieldCheck, Activity, Clock, Inbox } from 'lucide-react';
import type { PermissionKey, UserPrincipal } from '@hq/auth/types';
import { PERMISSIONS } from '@/lib/access';
import { cn } from '@/lib/cn';

interface Props {
  principal: UserPrincipal;
  mobileOpen?: boolean;
  onClose?: () => void;
}

function toRoleLabel(role: UserPrincipal['effectiveRole']): string {
  const normalized = role.toLowerCase().replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function Sidebar({ principal, mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const primaryItems: Array<{
    href: string;
    label: string;
    icon: React.ElementType;
    requiredPermission: PermissionKey;
  }> = [
    { href: '/messaging', label: 'Messaging', icon: MessageSquare, requiredPermission: PERMISSIONS.messagingView },
    { href: '/objects', label: 'Objects', icon: Database, requiredPermission: PERMISSIONS.workshopView },
    { href: '/projects', label: 'Projects', icon: LayoutGrid, requiredPermission: PERMISSIONS.workshopView },
    { href: '/agents', label: 'Agents', icon: Cpu, requiredPermission: PERMISSIONS.workshopView },
    { href: '/workflows', label: 'Workflows', icon: Workflow, requiredPermission: PERMISSIONS.workshopView },
    { href: '/approvals', label: 'Approvals', icon: ShieldCheck, requiredPermission: PERMISSIONS.approvalsView },
    { href: '/inbox', label: 'Inbox', icon: Inbox, requiredPermission: PERMISSIONS.workshopView },
    { href: '/jobs', label: 'Jobs', icon: Clock, requiredPermission: PERMISSIONS.adminSurface },
    { href: '/diagnostics', label: 'Diagnostics', icon: Activity, requiredPermission: PERMISSIONS.adminSurface },
    { href: '/notes', label: 'Notes', icon: NotebookPen, requiredPermission: PERMISSIONS.workshopView },
    { href: '/bots', label: 'Bots', icon: Bot, requiredPermission: PERMISSIONS.botsView },
    { href: '/users', label: 'Users', icon: Users, requiredPermission: PERMISSIONS.usersView },
  ];
  const displayName = principal.email.split('@')[0] ?? principal.email;
  const roleLabel = toRoleLabel(principal.effectiveRole);
  const settingsActive = pathname === '/settings' || pathname.startsWith('/settings/');

  const handleNavClick = () => {
    onClose?.();
  };

  const sidebarContent = (
    <aside className="sidebar-surface flex h-screen w-[232px] flex-col border-r px-3 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-white/10 ring-1 ring-white/15">
            <Image src="/assets/brand/logo-icon.svg" alt="Aiwah logo" width={21} height={21} priority />
          </div>
          {principal.permissions[PERMISSIONS.workshopView] ? (
            <Link
              href="/workshop"
              onClick={handleNavClick}
              className="sidebar-link h-auto px-0 py-0 hover:bg-transparent"
            >
              <p className="font-wordmark text-[16px] font-light uppercase leading-none tracking-[0.12em] text-[var(--sidebar-fg)]">
                WORKSHOP
              </p>
            </Link>
          ) : (
            <p className="font-wordmark text-[16px] font-light uppercase leading-none tracking-[0.12em] text-[var(--sidebar-fg)]">
              WORKSHOP
            </p>
          )}
        </div>

        {/* Close button — mobile only */}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--sidebar-fg)] transition-colors hover:bg-white/10 md:hidden"
            aria-label="Close menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <nav className="mt-6 flex flex-col gap-1">
        {primaryItems
          .filter((item) => principal.permissions[item.requiredPermission])
          .map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={cn('sidebar-link relative', isActive && 'active')}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-sm bg-[var(--color-brand-teal)]" />
                )}
                <Icon size={15} className="mr-2.5 opacity-80" />
                {item.label}
              </Link>
            );
          })}
      </nav>

      <div className="mt-auto space-y-2">
        {principal.permissions[PERMISSIONS.settingsView] ? (
          <Link
            href="/settings"
            onClick={handleNavClick}
            className={cn('sidebar-link relative', settingsActive && 'active')}
          >
            {settingsActive && (
              <div className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-sm bg-[var(--color-brand-teal)]" />
            )}
            <Settings size={15} className="mr-2.5 opacity-80" />
            Settings
          </Link>
        ) : null}

        <div className="rounded-[7px] border border-[var(--sidebar-border)] bg-white/[0.04] px-2.5 py-2">
          <p className="truncate text-[12px] font-medium text-[var(--sidebar-fg)]">{displayName}</p>
          <p className="mt-0.5 text-[11px] text-[var(--sidebar-muted)]">{roleLabel}</p>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:block shrink-0 sticky top-0 h-screen w-[232px]">
        {sidebarContent}
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen ? (
        <div className="absolute inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="relative z-10 h-full w-[232px] animate-slide-in">
            {sidebarContent}
          </div>
        </div>
      ) : null}
    </>
  );
}
