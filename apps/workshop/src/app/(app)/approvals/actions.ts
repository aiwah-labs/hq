'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';
import { db } from '@hq/db';
import { dispatchAction } from '@hq/actions';

export async function approveRequestAction(id: string, note?: string) {
  const principal = await requirePermission(PERMISSIONS.approvalsDecide);

  const approval = await db.actionApprovalRequest.findUnique({ where: { id } });
  if (!approval) throw new Error('Approval not found.');
  if (approval.status !== 'PENDING') throw new Error(`Already ${approval.status}.`);

  await db.actionApprovalRequest.update({
    where: { id },
    data: {
      status: 'APPROVED',
      decidedByUserId: principal.userId,
      decidedAt: new Date(),
      reason: note ?? approval.reason,
    },
  });

  const outcome = await dispatchAction(approval.actionName, approval.input, principal, {
    skipApproval: true,
    approvedRequestId: approval.id,
    correlationId: approval.id,
  });

  revalidatePath('/approvals');
  revalidatePath(`/approvals/${id}`);

  if (!outcome.ok) throw new Error(outcome.message);
  return { ok: true };
}

export async function rejectRequestAction(id: string, note?: string) {
  const principal = await requirePermission(PERMISSIONS.approvalsDecide);

  const approval = await db.actionApprovalRequest.findUnique({ where: { id } });
  if (!approval) throw new Error('Approval not found.');
  if (approval.status !== 'PENDING') throw new Error(`Already ${approval.status}.`);

  await db.actionApprovalRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      decidedByUserId: principal.userId,
      decidedAt: new Date(),
      reason: note ?? approval.reason,
    },
  });

  await db.actionExecution.updateMany({
    where: { approvalRequestId: id, status: 'PENDING_APPROVAL' },
    data: {
      status: 'CANCELLED',
      completedAt: new Date(),
      error: note ?? 'Rejected by approver.',
    },
  });

  revalidatePath('/approvals');
  revalidatePath(`/approvals/${id}`);
  return { ok: true };
}
