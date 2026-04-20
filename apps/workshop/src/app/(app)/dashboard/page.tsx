import Link from 'next/link';
import { db } from '@hq/db';
import { requireAuth } from '@/lib/auth';
import { Badge, EmptyState, Button } from '@/components/ui';
import { markReadAction, archiveAction, markAllReadAction } from './actions';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────────────────

type TabKey = 'all' | 'action' | 'alerts' | 'updates';

const TAB_LABELS: Record<TabKey, string> = {
  all: 'All',
  action: 'Needs action',
  alerts: 'Alerts',
  updates: 'Updates',
};

const ACTION_TYPES = new Set(['approval_requested', 'task_assigned']);
const ALERT_TYPES = new Set(['workflow_failed']);
const UPDATE_TYPES = new Set(['agent_handoff', 'mention', 'welcome', 'system']);

const TYPE_LABELS: Record<string, string> = {
  task_assigned: 'Task',
  approval_requested: 'Approval',
  workflow_failed: 'Failure',
  agent_handoff: 'Handoff',
  mention: 'Mention',
  welcome: 'Welcome',
  system: 'System',
};

const TYPE_TONE: Record<string, 'neutral' | 'indigo' | 'warn' | 'danger' | 'teal' | 'success'> = {
  task_assigned: 'indigo',
  approval_requested: 'warn',
  workflow_failed: 'danger',
  agent_handoff: 'teal',
  mention: 'neutral',
  welcome: 'success',
  system: 'neutral',
};

function formatDate(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Quick links ────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { href: '/objects', label: 'Objects', desc: 'CRM records and custom types' },
  { href: '/workflows', label: 'Workflows', desc: 'Design and run automations' },
  { href: '/agents', label: 'Agents', desc: 'Manage AI workers' },
  { href: '/notes', label: 'Notes', desc: 'Team knowledge base' },
  { href: '/approvals', label: 'Approvals', desc: 'Review pending decisions' },
  { href: '/apps/demo', label: 'Demo App', desc: 'Example product catalog' },
];

// ── Page ───────────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const principal = await requireAuth();
  const { tab } = await searchParams;
  const activeTab: TabKey = (tab as TabKey) ?? 'all';

  // ── Data fetching ────────────────────────────────────────────────────────

  const [items, openApprovals, activeWorkflows, noteCount] = await Promise.all([
    db.inboxItem.findMany({
      where: { recipientUserId: principal.userId, status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'desc' },
      take: 150,
    }),
    db.actionApprovalRequest.count({ where: { status: 'PENDING' } }),
    db.workflowRun.count({ where: { status: 'RUNNING' } }),
    db.note.count(),
  ]);

  const unreadCount = items.filter((i) => i.status === 'UNREAD').length;

  // ── Tab filtering ────────────────────────────────────────────────────────

  const filteredItems = items.filter((item) => {
    if (activeTab === 'action') return ACTION_TYPES.has(item.type);
    if (activeTab === 'alerts') return ALERT_TYPES.has(item.type);
    if (activeTab === 'updates') return UPDATE_TYPES.has(item.type);
    return true;
  });

  const actionCount = items.filter((i) => ACTION_TYPES.has(i.type) && i.status === 'UNREAD').length;
  const alertCount = items.filter((i) => ALERT_TYPES.has(i.type) && i.status === 'UNREAD').length;

  // ── Stats ────────────────────────────────────────────────────────────────

  const stats = [
    { label: 'Unread inbox', value: unreadCount, sub: 'Items awaiting review', href: '/dashboard' },
    { label: 'Open approvals', value: openApprovals, sub: 'Awaiting sign-off', href: '/approvals' },
    { label: 'Active workflows', value: activeWorkflows, sub: 'Running now', href: '/workflows' },
    { label: 'Notes', value: noteCount, sub: 'Team knowledge base', href: '/notes' },
  ];

  const displayName = principal.email.split('@')[0] ?? 'there';

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 pt-6 pb-10">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">
          Good morning, {displayName}
        </h1>
        <p className="mt-1.5 text-[12.5px] text-[#62666d]">
          Here&rsquo;s what&rsquo;s happening across your workspace.
        </p>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <div className="mb-7 flex items-stretch overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        {stats.map((s, i) => (
          <Link
            key={s.label}
            href={s.href}
            className={`group flex-1 px-4 py-3 transition-colors hover:bg-[#fafbfb] ${i > 0 ? 'border-l border-[#e6e8eb]' : ''}`}
          >
            <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">
              {s.label}
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums tracking-tight text-[#0f1011]">
              {s.value}
            </p>
            <p className="mt-1.5 text-[11px] text-[#8a8f98]">{s.sub}</p>
          </Link>
        ))}
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className="flex gap-6">
        {/* ── Left: Inbox ─────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Inbox header */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[#0f1011]">Inbox</h2>
              {unreadCount > 0 && (
                <Badge tone="indigo" className="tabular-nums">{unreadCount}</Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <form action={markAllReadAction}>
                <Button type="submit" variant="outline" size="xs" data-testid="mark-all-read-btn">
                  Mark all read
                </Button>
              </form>
            )}
          </div>

          {/* Filter tabs */}
          <div className="mb-3 flex items-center gap-0.5 rounded-lg border border-[#e6e8eb] bg-white p-1">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((tabKey) => {
              const isActive = activeTab === tabKey;
              const badge =
                tabKey === 'action' && actionCount > 0
                  ? actionCount
                  : tabKey === 'alerts' && alertCount > 0
                  ? alertCount
                  : null;
              return (
                <Link
                  key={tabKey}
                  href={tabKey === 'all' ? '/dashboard' : `/dashboard?tab=${tabKey}`}
                  data-testid={`inbox-tab-${tabKey}`}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    isActive
                      ? 'bg-[#f3f4f6] text-[#0f1011]'
                      : 'text-[#62666d] hover:bg-[#f8f9fa] hover:text-[#0f1011]'
                  }`}
                >
                  {TAB_LABELS[tabKey]}
                  {badge !== null && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#009E85] px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Inbox list */}
          {filteredItems.length === 0 ? (
            <div className="rounded-lg border border-[#e6e8eb] bg-white">
              <EmptyState
                title={activeTab === 'all' ? 'All caught up' : 'Nothing here'}
                description={
                  activeTab === 'all'
                    ? 'Your inbox is empty.'
                    : `No ${TAB_LABELS[activeTab].toLowerCase()} items.`
                }
                data-testid="inbox-empty"
              />
            </div>
          ) : (
            <ol
              className="divide-y divide-[#eff0f2] overflow-hidden rounded-lg border border-[#e6e8eb] bg-white"
              data-testid="inbox-list"
            >
              {filteredItems.map((item) => {
                const isUnread = item.status === 'UNREAD';
                return (
                  <li
                    key={item.id}
                    className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#fafbfb]${isUnread ? ' bg-[#fafbff]' : ''}`}
                    data-testid={`inbox-item-${item.id}`}
                  >
                    {/* Unread dot */}
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0">
                      {isUnread && (
                        <span className="block h-1.5 w-1.5 rounded-full bg-[#009E85]" aria-label="Unread" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <Badge tone={TYPE_TONE[item.type] ?? 'neutral'}>
                            {TYPE_LABELS[item.type] ?? item.type.replace(/_/g, ' ')}
                          </Badge>
                          <p className="text-[12.5px] font-medium text-[#0f1011]">{item.title}</p>
                          {item.body && (
                            <p className="text-[12px] text-[#62666d]">{item.body}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-[#8a8f98]">
                          {formatDate(new Date(item.createdAt))}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-3">
                        {item.actionUrl && (
                          <Link
                            href={item.actionUrl}
                            className="text-[12px] font-medium text-[#009E85] transition-colors hover:text-[#007A66]"
                          >
                            View →
                          </Link>
                        )}
                        {isUnread && (
                          <form action={markReadAction.bind(null, item.id)}>
                            <button
                              type="submit"
                              className="text-[12px] text-[#8a8f98] transition-colors hover:text-[#3d4149] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009E85]/40 focus-visible:ring-offset-1"
                            >
                              Mark read
                            </button>
                          </form>
                        )}
                        <form action={archiveAction.bind(null, item.id)}>
                          <button
                            type="submit"
                            className="text-[12px] text-[#8a8f98] opacity-0 transition-colors hover:text-[#3d4149] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009E85]/40 focus-visible:ring-offset-1 group-hover:opacity-100"
                          >
                            Archive
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* ── Right: Widgets ──────────────────────────────────────────── */}
        <div className="w-[260px] shrink-0 space-y-5">
          {/* Quick links */}
          <div>
            <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#8a8f98]">
              Jump to
            </h3>
            <div className="divide-y divide-[#eff0f2] overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
              {QUICK_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="group flex items-center px-3 py-2.5 transition-colors hover:bg-[#fafbfb]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[#0f1011]">{l.label}</p>
                    <p className="text-[11px] text-[#8a8f98]">{l.desc}</p>
                  </div>
                  <span className="ml-2 shrink-0 text-[11px] text-[#d0d6e0] transition-colors group-hover:text-[#62666d]">
                    &rsaquo;
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Getting started */}
          <div>
            <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#8a8f98]">
              Getting started
            </h3>
            <div className="divide-y divide-[#eff0f2] overflow-hidden rounded-lg border border-[#e6e8eb] bg-white text-[12px]">
              {[
                { label: 'Explore the Demo App', href: '/apps/demo', done: false },
                { label: 'Browse object types', href: '/objects', done: false },
                { label: 'Check running workflows', href: '/workflows', done: activeWorkflows > 0 },
                { label: 'Invite your team', href: '/users', done: false },
                { label: 'Connect an integration', href: '/settings/integrations', done: false },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-[#fafbfb]"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
                      item.done
                        ? 'border-[#009E85] bg-[#009E85] text-white'
                        : 'border-[#d0d6e0] text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className={item.done ? 'line-through text-[#8a8f98]' : 'text-[#0f1011]'}>
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
