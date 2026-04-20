'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_ICON, APP_NAME } from '@/config/brand';
import {
  Database, Bot, Users, Settings, Cpu, Workflow,
  NotebookPen, LayoutGrid, ShieldCheck, Activity, Clock, FolderOpen,
  Search, ChevronDown, House, AppWindow,
} from 'lucide-react';
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

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  requiredPermission: PermissionKey;
}

const NAV_SECTIONS: Array<{ label?: string; items: NavItem[] }> = [
  {
    items: [
      { href: '/dashboard', label: 'Home',     icon: House,       requiredPermission: PERMISSIONS.workshopView },
      { href: '/projects',  label: 'Projects', icon: LayoutGrid,  requiredPermission: PERMISSIONS.workshopView },
      { href: '/apps/demo', label: 'Demo App', icon: AppWindow,   requiredPermission: PERMISSIONS.workshopView },
      { href: '/notes',     label: 'Notes',    icon: NotebookPen, requiredPermission: PERMISSIONS.workshopView },
      { href: '/files',     label: 'Files',    icon: FolderOpen,  requiredPermission: PERMISSIONS.workshopView },
    ],
  },
  {
    label: 'Platform',
    items: [
      { href: '/objects',     label: 'Objects',     icon: Database,    requiredPermission: PERMISSIONS.workshopView },
      { href: '/agents',      label: 'Agents',      icon: Cpu,         requiredPermission: PERMISSIONS.workshopView },
      { href: '/workflows',   label: 'Workflows',   icon: Workflow,    requiredPermission: PERMISSIONS.workshopView },
      { href: '/approvals',   label: 'Approvals',   icon: ShieldCheck, requiredPermission: PERMISSIONS.approvalsView },
      { href: '/bots',        label: 'Bots',        icon: Bot,         requiredPermission: PERMISSIONS.botsView },
      { href: '/jobs',        label: 'Jobs',        icon: Clock,       requiredPermission: PERMISSIONS.adminSurface },
      { href: '/diagnostics', label: 'Diagnostics', icon: Activity,    requiredPermission: PERMISSIONS.adminSurface },
      { href: '/users',       label: 'Users',       icon: Users,       requiredPermission: PERMISSIONS.usersView },
    ],
  },
];

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      data-testid={`nav-${label.toLowerCase()}`}
      className={cn('sidebar-link group', isActive && 'active')}
    >
      <Icon
        size={14}
        className={cn('mr-2 shrink-0 transition-colors', isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-80')}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Sidebar({ principal, mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const displayName = principal.email.split('@')[0] ?? principal.email;
  const roleLabel = toRoleLabel(principal.effectiveRole);
  const settingsActive = pathname === '/settings' || pathname.startsWith('/settings/');

  const handleNavClick = () => { onClose?.(); };

  const sidebarContent = (
    <aside
      className="sidebar-surface flex h-screen w-[220px] flex-col border-r"
      data-testid="sidebar"
    >
      {/* ── Workspace header ──────────────────────────── */}
      <div className="flex h-12 shrink-0 items-center justify-between px-3 border-b border-[var(--sidebar-border)]">
        <div className="flex items-center gap-2 min-w-0">
          {/* Logo mark — small dark square, works on light bg */}
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] bg-[#0f1011]">
            <Image src={APP_ICON} alt={`${APP_NAME} logo`} width={14} height={14} priority />
          </div>

          {principal.permissions[PERMISSIONS.workshopView] ? (
            <Link
              href="/workshop"
              onClick={handleNavClick}
              className="min-w-0 truncate font-wordmark text-[13px] font-light uppercase leading-none tracking-[0.1em] text-[var(--sidebar-fg)]"
            >
              Workshop
            </Link>
          ) : (
            <span className="min-w-0 truncate font-wordmark text-[13px] font-light uppercase leading-none tracking-[0.1em] text-[var(--sidebar-fg)]">
              Workshop
            </span>
          )}
        </div>

        {/* Mobile close */}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-fg)] transition-colors md:hidden"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* ── Search / ⌘K ───────────────────────────────── */}
      <div className="px-2.5 py-2 border-b border-[var(--sidebar-border)]">
        <button
          type="button"
          aria-label="Search (⌘K)"
          className="flex h-7 w-full items-center gap-2 rounded-md border border-[var(--sidebar-border)] bg-[var(--app-bg-elevated)] px-2.5 text-[12px] text-[var(--sidebar-muted)] hover:border-[#d0d6e0] hover:text-[var(--sidebar-secondary)] transition-colors duration-100"
        >
          <Search size={11} className="shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[10px] font-medium bg-[var(--sidebar-hover)] rounded px-1 py-[1px] leading-none border border-[var(--sidebar-border)]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ── Navigation ────────────────────────────────── */}
      <nav className="flex flex-col gap-3.5 flex-1 min-h-0 overflow-y-auto scrollbar-none px-2.5 py-3">
        {NAV_SECTIONS.map((section, si) => {
          const visibleItems = section.items.filter(
            (item) => principal.permissions[item.requiredPermission]
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={si} className="flex flex-col gap-0.5">
              {section.label ? (
                <p className="px-2 pt-0.5 pb-1 text-[10.5px] font-medium uppercase tracking-[0.07em] text-[var(--sidebar-muted)] select-none">
                  {section.label}
                </p>
              ) : null}
              {visibleItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    isActive={isActive}
                    onClick={handleNavClick}
                  />
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ── Bottom — settings + user ──────────────────── */}
      <div className="shrink-0 border-t border-[var(--sidebar-border)] px-2.5 py-2.5 space-y-0.5">
        {principal.permissions[PERMISSIONS.settingsView] ? (
          <NavLink
            href="/settings"
            label="Settings"
            icon={Settings}
            isActive={settingsActive}
            onClick={handleNavClick}
          />
        ) : null}

        {/* User row */}
        <button
          type="button"
          className="mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--sidebar-hover)] transition-colors"
          aria-label="Account menu"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#009E85] text-[9px] font-semibold text-white select-none">
            {displayName[0]?.toUpperCase() ?? '?'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium leading-none text-[var(--sidebar-fg)]">{displayName}</p>
            <p className="mt-0.5 truncate text-[10.5px] leading-none text-[var(--sidebar-muted)]">{roleLabel}</p>
          </div>
          <ChevronDown size={12} className="shrink-0 text-[var(--sidebar-muted)]" />
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block shrink-0 sticky top-0 h-screen w-[220px]">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {mobileOpen ? (
        <div className="absolute inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full w-[220px] animate-slide-in">
            {sidebarContent}
          </div>
        </div>
      ) : null}
    </>
  );
}
