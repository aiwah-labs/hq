/**
 * Approval queue + action execution audit endpoints.
 *
 * These routes surface the governance metadata recorded by the action
 * dispatcher (see `shared/actions/src/dispatch.ts`):
 *
 *  - `ActionApprovalRequest` rows are created when a high-risk/explicitly-
 *    gated action is dispatched and the caller does not hold a `bypassScope`.
 *  - `ActionExecution` rows record every dispatcher run, including the
 *    `PENDING_APPROVAL` placeholder that gets promoted to `RUNNING` →
 *    `COMPLETED` when the approval is granted.
 *
 * Approve/reject operations require the `approvals.decide` permission. An
 * approval POST re-invokes `dispatchAction` with `skipApproval: true` so the
 * action runs through the same validation + audit code path.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@hq/db';
import { can } from '@hq/auth/policy';
import { dispatchAction } from '@hq/actions';
import { createInboxItem, createServiceContext } from '@hq/services';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

const idParamsSchema = z.object({ id: z.string().min(1) });

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']).optional(),
  actionName: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const executionsQuerySchema = z.object({
  status: z
    .enum(['PENDING_APPROVAL', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .optional(),
  actionName: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const decisionBodySchema = z
  .object({ note: z.string().max(2000).optional() })
  .optional();

function requirePermission(principal: Parameters<typeof can>[0], key: Parameters<typeof can>[1]['action']['permissions'][number]) {
  const decision = can(principal, { action: { name: 'approvals.decide', permissions: [key] } });
  if (!decision.allowed) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      `Missing required permission '${key}'.`,
    );
  }
}

export async function registerApprovalRoutes(app: FastifyInstance) {
  // List approval requests (filterable by status/action).
  app.get('/v1/approvals', async (request) => {
    const principal = await requireAuth(request);
    requirePermission(principal, 'approvals.view');
    const query = listQuerySchema.parse(request.query);
    const rows = await db.actionApprovalRequest.findMany({
      where: {
        status: query.status,
        actionName: query.actionName,
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return { approvals: rows };
  });

  app.get('/v1/approvals/:id', async (request) => {
    const principal = await requireAuth(request);
    requirePermission(principal, 'approvals.view');
    const { id } = idParamsSchema.parse(request.params);
    const row = await db.actionApprovalRequest.findUnique({
      where: { id },
      include: { execution: true },
    });
    if (!row) throw new ApiError(404, 'NOT_FOUND', `Approval ${id} not found.`);
    return row;
  });

  app.post('/v1/approvals/:id/approve', async (request, reply) => {
    const principal = await requireAuth(request);
    requirePermission(principal, 'approvals.decide');
    const { id } = idParamsSchema.parse(request.params);
    const body = decisionBodySchema.parse(request.body ?? {});

    const approval = await db.actionApprovalRequest.findUnique({
      where: { id },
      include: { execution: true },
    });
    if (!approval) throw new ApiError(404, 'NOT_FOUND', `Approval ${id} not found.`);
    if (approval.status !== 'PENDING') {
      throw new ApiError(409, 'CONFLICT', `Approval is already ${approval.status}.`);
    }

    const decidedBy =
      principal.kind === 'user' ? principal.userId : `${principal.kind}:${(principal as { botId?: string; agentId?: string }).botId ?? (principal as { agentId?: string }).agentId ?? 'system'}`;

    await db.actionApprovalRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        decidedByUserId: principal.kind === 'user' ? principal.userId : null,
        decidedAt: new Date(),
        reason: body?.note ?? approval.reason,
      },
    });

    // Re-invoke the action through the dispatcher, bypassing the gate.
    const outcome = await dispatchAction(
      approval.actionName,
      approval.input,
      principal,
      { skipApproval: true, approvedRequestId: approval.id, correlationId: approval.id },
    );

    if (!outcome.ok) {
      throw new ApiError(
        outcome.status,
        outcome.code,
        outcome.message,
        'details' in outcome ? outcome.details : undefined,
      );
    }
    // Notify the requester (if they're a user) that their action was approved.
    if (approval.requestedByType === 'user') {
      void createInboxItem(createServiceContext(principal), {
        recipientUserId: approval.requestedById,
        type: 'approval_decided',
        title: `Approved: ${approval.actionName}`,
        body: `Your request for "${approval.actionName}" was approved.`,
        sourceType: 'ActionApprovalRequest',
        sourceId: approval.id,
        actionUrl: `/approvals/${approval.id}`,
      }).catch(() => {});
    }

    reply.code(200);
    return {
      approvalId: approval.id,
      status: 'APPROVED',
      decidedBy,
      execution:
        'pending' in outcome
          ? null
          : { id: outcome.executionId, result: outcome.result, risk: outcome.risk },
    };
  });

  app.post('/v1/approvals/:id/reject', async (request) => {
    const principal = await requireAuth(request);
    requirePermission(principal, 'approvals.decide');
    const { id } = idParamsSchema.parse(request.params);
    const body = decisionBodySchema.parse(request.body ?? {});

    const approval = await db.actionApprovalRequest.findUnique({ where: { id } });
    if (!approval) throw new ApiError(404, 'NOT_FOUND', `Approval ${id} not found.`);
    if (approval.status !== 'PENDING') {
      throw new ApiError(409, 'CONFLICT', `Approval is already ${approval.status}.`);
    }

    await db.actionApprovalRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedByUserId: principal.kind === 'user' ? principal.userId : null,
        decidedAt: new Date(),
        reason: body?.note ?? approval.reason,
      },
    });

    // Promote the linked execution row to CANCELLED so the timeline matches.
    if (approval.id) {
      await db.actionExecution.updateMany({
        where: { approvalRequestId: approval.id, status: 'PENDING_APPROVAL' },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
          error: body?.note ?? 'Rejected by approver.',
        },
      });
    }

    // Notify the requester (if they're a user) that their action was rejected.
    if (approval.requestedByType === 'user') {
      void createInboxItem(createServiceContext(principal), {
        recipientUserId: approval.requestedById,
        type: 'approval_decided',
        title: `Rejected: ${approval.actionName}`,
        body: body?.note ?? `Your request for "${approval.actionName}" was rejected.`,
        sourceType: 'ActionApprovalRequest',
        sourceId: approval.id,
        actionUrl: `/approvals/${approval.id}`,
      }).catch(() => {});
    }

    return { approvalId: approval.id, status: 'REJECTED' };
  });

  app.get('/v1/action-executions', async (request) => {
    const principal = await requireAuth(request);
    requirePermission(principal, 'approvals.view');
    const query = executionsQuerySchema.parse(request.query);
    const rows = await db.actionExecution.findMany({
      where: {
        status: query.status,
        actionName: query.actionName,
      },
      orderBy: { startedAt: 'desc' },
      take: query.limit,
    });
    return { executions: rows };
  });

  app.get('/v1/action-executions/:id', async (request) => {
    const principal = await requireAuth(request);
    requirePermission(principal, 'approvals.view');
    const { id } = idParamsSchema.parse(request.params);
    const row = await db.actionExecution.findUnique({
      where: { id },
      include: { approvalRequest: true },
    });
    if (!row) throw new ApiError(404, 'NOT_FOUND', `Execution ${id} not found.`);
    return row;
  });
}
