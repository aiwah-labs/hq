import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';
import { db } from '@hq/db';

export const dynamic = 'force-dynamic';

export default async function ApprovalsQueuePage() {
  await requirePermission(PERMISSIONS.approvalsView);

  const [pending, recent] = await Promise.all([
    db.actionApprovalRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.actionApprovalRequest.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED'] } },
      orderBy: { decidedAt: 'desc' },
      take: 20,
    }),
  ]);

  return (
    <div className="flex h-full flex-col" data-testid="approvals-queue">
      <div className="border-b border-[var(--border)] px-6 py-4">
        <h1 className="text-[18px] font-semibold text-[var(--fg)]">Approvals</h1>
        <p className="mt-0.5 text-[13px] text-[var(--muted)]">
          High-risk actions requested by bots, agents, and MCP clients. Approve to execute, reject to cancel.
        </p>
      </div>

      <section className="border-b border-[var(--border)] px-6 py-4">
        <h2 className="text-[14px] font-semibold text-[var(--fg)]">Pending ({pending.length})</h2>
        <ul className="mt-2 divide-y divide-[var(--border)]" data-testid="pending-approvals">
          {pending.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2">
              <Link
                href={`/approvals/${a.id}`}
                className="text-[14px] font-medium text-[var(--fg)] hover:underline"
                data-testid={`approval-link-${a.id}`}
              >
                {a.actionName}
              </Link>
              <span className="text-[12px] uppercase tracking-wide text-[var(--muted)]">
                {a.risk} · {a.requestedByType}
              </span>
            </li>
          ))}
          {pending.length === 0 && (
            <li className="py-4 text-[13px] text-[var(--muted)]">Nothing waiting on approval.</li>
          )}
        </ul>
      </section>

      <section className="px-6 py-4">
        <h2 className="text-[14px] font-semibold text-[var(--fg)]">Recent decisions</h2>
        <ul className="mt-2 divide-y divide-[var(--border)]" data-testid="recent-approvals">
          {recent.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2">
              <Link
                href={`/approvals/${a.id}`}
                className="text-[13px] text-[var(--fg)] hover:underline"
                data-testid={`approval-history-${a.id}`}
              >
                {a.actionName}
              </Link>
              <span
                className="text-[12px] uppercase tracking-wide"
                style={{ color: a.status === 'APPROVED' ? 'var(--accent)' : 'var(--muted)' }}
              >
                {a.status}
              </span>
            </li>
          ))}
          {recent.length === 0 && (
            <li className="py-4 text-[13px] text-[var(--muted)]">No recent decisions.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
