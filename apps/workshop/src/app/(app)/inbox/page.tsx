import { db } from '@hq/db';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { Button, Badge, EmptyState } from '@/components/ui';
import { markReadAction, archiveAction, markAllReadAction } from './actions';

export const dynamic = 'force-dynamic';

const typeLabels: Record<string, string> = {
  task_assigned: 'Task',
  approval_requested: 'Approval',
  workflow_failed: 'Failure',
  agent_handoff: 'Handoff',
  mention: 'Mention',
};

const typeTone: Record<string, 'neutral' | 'indigo' | 'warn' | 'danger' | 'teal'> = {
  task_assigned: 'indigo',
  approval_requested: 'warn',
  workflow_failed: 'danger',
  agent_handoff: 'teal',
  mention: 'neutral',
};

function formatDate(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    <div className="space-y-4" data-testid="inbox-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
            <span className="font-medium">Home</span>
            <span className="text-[#d0d6e0]">/</span>
            <span>Inbox</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">
              Inbox
            </h1>
            {unreadCount > 0 && (
              <Badge tone="indigo" className="tabular-nums">{unreadCount}</Badge>
            )}
          </div>
          <p className="mt-2 text-[12.5px] text-[#62666d]">
            Assignments, approvals, and alerts that need your attention.
          </p>
        </div>
        {unreadCount > 0 && (
          <form action={markAllReadAction} className="shrink-0 pt-1">
            <Button type="submit" variant="outline" size="xs" data-testid="mark-all-read-btn">
              Mark all read
            </Button>
          </form>
        )}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-[#e6e8eb] bg-white">
          <EmptyState
            title="All caught up"
            description="No unread items in your inbox."
            data-testid="inbox-empty"
          />
        </div>
      ) : (
        <ol
          className="overflow-hidden divide-y divide-[#eff0f2] rounded-lg border border-[#e6e8eb] bg-white"
          data-testid="inbox-list"
        >
          {items.map((item) => {
            const isUnread = item.status === 'UNREAD';
            return (
              <li
                key={item.id}
                className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#fafbfb]${isUnread ? ' bg-[#fafbfb]' : ''}`}
                data-testid={`inbox-item-${item.id}`}
              >
                {/* Unread dot — fixed-width container keeps read items aligned */}
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0">
                  {isUnread && (
                    <span className="block h-1.5 w-1.5 rounded-full bg-[#009E85]" aria-label="Unread" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <Badge tone={typeTone[item.type] ?? 'neutral'}>
                        {typeLabels[item.type] ?? item.type.replace(/_/g, ' ')}
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

                  {/* Actions — archive is hover-revealed, primary actions always visible */}
                  <div className="mt-2 flex items-center gap-3">
                    {item.actionUrl && (
                      <Link
                        href={item.actionUrl}
                        className="text-[12px] font-medium text-[#009E85] hover:text-[#007A66] transition-colors"
                      >
                        View →
                      </Link>
                    )}
                    {isUnread && (
                      <form action={markReadAction.bind(null, item.id)}>
                        <button
                          type="submit"
                          className="text-[12px] text-[#8a8f98] hover:text-[#3d4149] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009E85]/40 focus-visible:ring-offset-1"
                        >
                          Mark read
                        </button>
                      </form>
                    )}
                    <form action={archiveAction.bind(null, item.id)}>
                      <button
                        type="submit"
                        className="text-[12px] text-[#8a8f98] hover:text-[#3d4149] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009E85]/40 focus-visible:ring-offset-1 opacity-0 group-hover:opacity-100"
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
  );
}
