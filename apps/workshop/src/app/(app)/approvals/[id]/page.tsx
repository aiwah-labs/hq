import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';
import { db } from '@hq/db';
import { actionRegistry, serializeAction } from '@hq/actions';
import { ApprovalDecisionForm } from '@/components/approvals/ApprovalDecisionForm';
import { ActivityTimeline } from '@/components/activity/activity-timeline';

export const dynamic = 'force-dynamic';

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.approvalsView);
  const { id } = await params;

  const approval = await db.actionApprovalRequest.findUnique({
    where: { id },
    include: { execution: true },
  });
  if (!approval) notFound();

  const action = actionRegistry.get(approval.actionName);
  const serialized = action ? serializeAction(action) : null;

  const rows: Array<[string, string]> = [
    ['Action', approval.actionName],
    ['Risk', approval.risk],
    ['Status', approval.status],
    ['Requested by', `${approval.requestedByType}:${approval.requestedById}`],
    ['Reason', approval.reason ?? '—'],
    ['Created', approval.createdAt.toISOString()],
  ];

  return (
    <div className="space-y-4" data-testid="approval-detail">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <Link href="/approvals" className="hover:text-[#0f1011] transition-colors">Approvals</Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>{approval.id.slice(0, 8)}…</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">{approval.actionName}</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">Approval request {approval.id}</p>
      </div>

      {/* Details + Input */}
      <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
          <dl className="space-y-1">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-28 text-[11px] font-medium text-[#8a8f98]">{k}</dt>
                <dd className="text-[12.5px] text-[#0f1011]">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Input</p>
            <pre className="max-h-64 overflow-auto rounded-md border border-[#e6e8eb] bg-[#fafbfb] p-3 font-mono text-[11px] leading-relaxed text-[#0f1011]">
              {JSON.stringify(approval.input, null, 2)}
            </pre>
            {serialized && (
              <div className="mt-3 space-y-0.5">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Impact</p>
                <p className="text-[12.5px] text-[#62666d]">Reads: {serialized.objects?.reads?.join(', ') ?? '—'}</p>
                <p className="text-[12.5px] text-[#62666d]">Writes: {serialized.objects?.writes?.join(', ') ?? '—'}</p>
                <p className="text-[12.5px] text-[#62666d]">Deletes: {serialized.objects?.deletes?.join(', ') ?? '—'}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Decision */}
      {approval.status === 'PENDING' ? (
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white p-4">
          <ApprovalDecisionForm id={approval.id} />
        </div>
      ) : (
        <p className="text-[12.5px] text-[#62666d]">
          Decided {approval.decidedAt?.toISOString()} by {approval.decidedByUserId ?? 'system'}.
        </p>
      )}

      {/* Activity */}
      <div>
        <div className="mb-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Activity</h2>
        </div>
        <ActivityTimeline correlationId={approval.id} />
      </div>
    </div>
  );
}
