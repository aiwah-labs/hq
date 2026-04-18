import { db } from '@hq/db';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { markReadAction, archiveAction, markAllReadAction } from './actions';

export const dynamic = 'force-dynamic';

function TypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    task_assigned: 'bg-blue-500/15 text-blue-400',
    approval_requested: 'bg-amber-500/15 text-amber-400',
    workflow_failed: 'bg-red-500/15 text-red-400',
    agent_handoff: 'bg-purple-500/15 text-purple-400',
    mention: 'bg-teal-500/15 text-teal-400',
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${colorMap[type] ?? 'bg-neutral-500/15 text-neutral-400'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

export default async function InboxPage() {
  const principal = await requireAuth();

  const items = await db.inboxItem.findMany({
    where: { recipientUserId: principal.userId, status: { not: 'ARCHIVED' } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const unreadCount = items.filter((i) => i.status === 'UNREAD').length;

  return (
    <div className="space-y-6 p-6" data-testid="inbox-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--fg)]">
            Inbox
            {unreadCount > 0 ? (
              <span className="ml-2 rounded-full bg-[var(--color-brand-teal)] px-2 py-0.5 text-[11px] font-semibold text-white">
                {unreadCount}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">Assignments, approvals, and alerts that need your attention.</p>
        </div>
        {unreadCount > 0 ? (
          <form action={markAllReadAction}>
            <button
              type="submit"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--fg)] hover:bg-white/5"
              data-testid="mark-all-read-btn"
            >
              Mark all read
            </button>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-6 py-8 text-center" data-testid="inbox-empty">
          <p className="text-[14px] text-[var(--fg)]">All caught up</p>
          <p className="mt-1 text-[13px] text-[var(--muted)]">No unread items.</p>
        </div>
      ) : (
        <ol className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--surface)]" data-testid="inbox-list">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-start gap-4 px-4 py-4 ${item.status === 'UNREAD' ? 'bg-white/[0.02]' : ''}`}
              data-testid={`inbox-item-${item.id}`}
            >
              {item.status === 'UNREAD' && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-brand-teal)]" aria-label="Unread" />
              )}
              {item.status !== 'UNREAD' && <span className="mt-1.5 h-2 w-2 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <TypeBadge type={item.type} />
                    <p className="mt-1 font-medium text-[13px] text-[var(--fg)]">{item.title}</p>
                    {item.body ? <p className="text-[12px] text-[var(--muted)]">{item.body}</p> : null}
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-[var(--muted)]">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {item.actionUrl ? (
                    <Link href={item.actionUrl} className="text-[12px] text-[var(--color-brand-teal)] hover:underline">
                      View →
                    </Link>
                  ) : null}
                  {item.status === 'UNREAD' ? (
                    <form action={markReadAction.bind(null, item.id)}>
                      <button type="submit" className="text-[12px] text-[var(--muted)] hover:text-[var(--fg)]">
                        Mark read
                      </button>
                    </form>
                  ) : null}
                  <form action={archiveAction.bind(null, item.id)}>
                    <button type="submit" className="text-[12px] text-[var(--muted)] hover:text-[var(--fg)]">
                      Archive
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
