import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';
import { db } from '@hq/db';
import { EmptyState, StatusDot } from '@/components/ui';

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
    <div className="space-y-4" data-testid="approvals-queue">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <span>Approvals</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">
            Approvals
          </h1>
          {pending.length > 0 && (
            <span className="text-[11px] tabular-nums text-[#dc2626] font-medium">{pending.length} pending</span>
          )}
        </div>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          High-risk actions requested by bots, agents, and MCP clients.
        </p>
      </div>

      {/* Pending */}
      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Pending</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; awaiting review</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" data-testid="pending-approvals">
          {pending.length === 0 ? (
            <EmptyState title="Nothing waiting on approval" description="New requests will appear here." />
          ) : (
            <div className="divide-y divide-[#eff0f2]">
              {pending.map((a) => (
                <Link
                  key={a.id}
                  href={`/approvals/${a.id}`}
                  className="group flex h-11 items-center justify-between gap-3 px-4 hover:bg-[#fafbfb] transition-colors duration-100"
                  data-testid={`approval-link-${a.id}`}
                >
                  <span className="text-[12.5px] font-medium text-[#0f1011]">{a.actionName}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] uppercase tracking-[0.04em] text-[#8a8f98]">{a.risk}</span>
                    <span className="text-[11px] text-[#8a8f98]">{a.requestedByType}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent decisions */}
      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Recent decisions</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; last {recent.length} resolved</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" data-testid="recent-approvals">
          {recent.length === 0 ? (
            <EmptyState title="No recent decisions" />
          ) : (
            <div className="divide-y divide-[#eff0f2]">
              {recent.map((a) => (
                <Link
                  key={a.id}
                  href={`/approvals/${a.id}`}
                  className="group flex h-11 items-center justify-between gap-3 px-4 hover:bg-[#fafbfb] transition-colors duration-100"
                  data-testid={`approval-history-${a.id}`}
                >
                  <span className="text-[12.5px] text-[#0f1011]">{a.actionName}</span>
                  <StatusDot
                    tone={a.status === 'APPROVED' ? 'success' : 'danger'}
                    label={a.status}
                  />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
