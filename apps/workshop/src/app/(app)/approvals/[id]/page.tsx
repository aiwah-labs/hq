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
    <div className="flex h-full flex-col" data-testid="approval-detail">
      <div className="border-b border-[var(--border)] px-6 py-4">
        <h1 className="text-[18px] font-semibold text-[var(--fg)]">{approval.actionName}</h1>
        <p className="mt-0.5 text-[13px] text-[var(--muted)]">Approval request {approval.id}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 border-b border-[var(--border)] px-6 py-4 md:grid-cols-2">
        <dl className="text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2 py-1">
              <dt className="w-28 text-[var(--muted)]">{k}</dt>
              <dd className="text-[var(--fg)]">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="text-[13px]">
          <div className="text-[12px] uppercase tracking-wide text-[var(--muted)]">Input</div>
          <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-black/30 p-3 text-[12px] text-[var(--fg)]">
            {JSON.stringify(approval.input, null, 2)}
          </pre>
          {serialized && (
            <>
              <div className="mt-3 text-[12px] uppercase tracking-wide text-[var(--muted)]">Impact</div>
              <div className="mt-1 text-[13px] text-[var(--fg)]">
                <div>Reads: {serialized.objects?.reads?.join(', ') ?? '—'}</div>
                <div>Writes: {serialized.objects?.writes?.join(', ') ?? '—'}</div>
                <div>Deletes: {serialized.objects?.deletes?.join(', ') ?? '—'}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {approval.status === 'PENDING' ? (
        <div className="px-6 py-4">
          <ApprovalDecisionForm id={approval.id} />
        </div>
      ) : (
        <div className="px-6 py-4 text-[13px] text-[var(--muted)]">
          Decided {approval.decidedAt?.toISOString()} by {approval.decidedByUserId ?? 'system'}.
        </div>
      )}

      <div className="border-t border-[var(--border)] px-6 py-4">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Activity
        </h2>
        <ActivityTimeline correlationId={approval.id} />
      </div>
    </div>
  );
}
