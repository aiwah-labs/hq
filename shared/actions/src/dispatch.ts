/**
 * Action dispatcher
 *
 * One entry point for executing a registered action. Handles:
 *  - Principal-level authorization via the policy engine (uses action scopes
 *    as permission keys when the key matches the `{object}.{op}` shape).
 *  - Parameter validation against the zod schema.
 *  - Risk + approval gating. High-risk actions (or those with
 *    `approval.required`) do NOT execute immediately — instead, they record
 *    an `ActionApprovalRequest` + `ActionExecution(PENDING_APPROVAL)` pair
 *    and return `PENDING_APPROVAL` to the caller.
 *  - Building a ServiceContext from the principal.
 *  - Recording every run as an `ActionExecution` audit row.
 *  - Invoking the action handler.
 *
 * Every surface that executes actions (HTTP, MCP, workflow steps, agent runs)
 * should funnel through `dispatchAction` so policy is applied consistently.
 */
import type { AuthPrincipal, PermissionKey } from '@hq/auth/types';
import { can } from '@hq/auth/policy';
import { createServiceContext, createInboxItem, type ServiceContext } from '@hq/services';
import { emitEvent } from '@hq/events';
import { actionRegistry } from './registry.js';
import type { ActionDefinition, ActionRisk } from './types.js';
import { inferActionRisk } from './types.js';

export interface DispatchOptions {
  /** Override the registry lookup — useful for testing. */
  registry?: { get(name: string): ActionDefinition | undefined };
  /** Override the service context factory (tests). */
  buildContext?: (principal: AuthPrincipal) => ServiceContext;
  /** Optional channel ref to thread through to the context. */
  channelRef?: string;
  /** Optional correlation id (threaded through to `ActionExecution.correlationId`). */
  correlationId?: string;
  /**
   * If true, skip approval gating and execute even high-risk actions
   * immediately. Used by the approval-decision path to actually run an
   * approved request.
   */
  skipApproval?: boolean;
  /**
   * If provided, mark this execution as the execution of a previously
   * approved request. Ties `ActionExecution.approvalRequestId` back to the
   * approval audit row.
   */
  approvedRequestId?: string;
  /** Override the audit sink (tests). */
  audit?: AuditSink;
}

export type DispatchFailure =
  | { ok: false; status: 404; code: 'NOT_FOUND'; message: string }
  | { ok: false; status: 403; code: 'FORBIDDEN'; message: string; missingPermission?: PermissionKey }
  | { ok: false; status: 400; code: 'BAD_REQUEST'; message: string; details?: unknown }
  | { ok: false; status: 500; code: 'EXECUTION_ERROR'; message: string; executionId?: string };

export interface DispatchSuccess<T = unknown> {
  ok: true;
  result: T;
  executionId?: string;
  risk?: ActionRisk;
}

export interface DispatchPendingApproval {
  ok: true;
  pending: true;
  approvalRequestId: string;
  executionId: string;
  risk: ActionRisk;
  reason?: string;
}

export type DispatchResult<T = unknown> = DispatchSuccess<T> | DispatchPendingApproval | DispatchFailure;

/** Lightweight sink so tests can swap out DB writes. */
export interface AuditSink {
  startExecution(row: {
    actionName: string;
    actorType: string;
    actorId: string;
    risk: ActionRisk;
    input: unknown;
    status: 'RUNNING' | 'PENDING_APPROVAL';
    approvalRequestId?: string;
    correlationId?: string;
  }): Promise<{ id: string }>;
  completeExecution(id: string, patch: {
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
    output?: unknown;
    error?: string;
    durationMs: number;
  }): Promise<void>;
  createApprovalRequest(row: {
    actionName: string;
    requestedByType: string;
    requestedById: string;
    risk: ActionRisk;
    reason?: string;
    input: unknown;
  }): Promise<{ id: string }>;
}

function principalActor(p: AuthPrincipal): { actorType: string; actorId: string } {
  if (p.kind === 'user') return { actorType: 'user', actorId: p.userId };
  if (p.kind === 'bot') return { actorType: 'bot', actorId: p.botId };
  if (p.kind === 'agent') return { actorType: 'agent', actorId: p.agentKey };
  return { actorType: 'unknown', actorId: 'anonymous' };
}

function principalHoldsAny(p: AuthPrincipal, scopes: string[]): boolean {
  if (!scopes || scopes.length === 0) return false;
  const held = (p as { permissions?: unknown }).permissions;
  if (!held) return false;
  // Accept a Set, array, or PermissionMap-style record of booleans.
  if (held instanceof Set) return scopes.some((s) => held.has(s));
  if (Array.isArray(held)) return scopes.some((s) => held.includes(s));
  if (typeof held === 'object') {
    const map = held as Record<string, unknown>;
    return scopes.some((s) => Boolean(map[s]));
  }
  return false;
}

/**
 * Resolve the permissions required by this action. We intentionally mirror
 * `action.scopes` into permission keys — an action declares what it needs
 * (`task.update`, `actions.execute`, …) and the policy engine is the single
 * source of truth for whether the principal has that permission.
 */
function requiredPermissions(action: ActionDefinition): PermissionKey[] {
  return (action.scopes ?? []) as PermissionKey[];
}

function shouldRequireApproval(
  action: ActionDefinition,
  principal: AuthPrincipal,
  opts?: DispatchOptions,
): boolean {
  if (opts?.skipApproval) return false;
  if (action.approval?.required) {
    // bypassScopes let admins skip the gate for this specific action.
    if (action.approval.bypassScopes && principalHoldsAny(principal, action.approval.bypassScopes)) {
      return false;
    }
    return true;
  }
  return false;
}

function defaultAuditSink(): AuditSink {
  // Lazy import so tests without @hq/db mocked don't blow up. When db is
  // absent (unit tests), callers pass `opts.audit`.
  return {
    async startExecution(row) {
      const { db } = await import('@hq/db');
      const created = await db.actionExecution.create({
        data: {
          actionName: row.actionName,
          actorType: row.actorType,
          actorId: row.actorId,
          risk: row.risk.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH',
          input: (row.input ?? null) as never,
          status: row.status as never,
          approvalRequestId: row.approvalRequestId ?? null,
          correlationId: row.correlationId ?? null,
        },
      });
      return { id: created.id };
    },
    async completeExecution(id, patch) {
      const { db } = await import('@hq/db');
      await db.actionExecution.update({
        where: { id },
        data: {
          status: patch.status as never,
          output: (patch.output ?? null) as never,
          error: patch.error ?? null,
          completedAt: new Date(),
          durationMs: patch.durationMs,
        },
      });
    },
    async createApprovalRequest(row) {
      const { db } = await import('@hq/db');
      const created = await db.actionApprovalRequest.create({
        data: {
          actionName: row.actionName,
          requestedByType: row.requestedByType,
          requestedById: row.requestedById,
          risk: row.risk.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH',
          reason: row.reason ?? null,
          input: row.input as never,
        },
      });
      return { id: created.id };
    },
  };
}

export async function dispatchAction<T = unknown>(
  name: string,
  params: unknown,
  principal: AuthPrincipal,
  opts?: DispatchOptions,
): Promise<DispatchResult<T>> {
  const reg = opts?.registry ?? actionRegistry;
  const action = reg.get(name);
  if (!action) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: `Unknown action: ${name}` };
  }

  // Policy check — every required permission must pass.
  const required = requiredPermissions(action);
  const decision = can(principal, { action: { name: action.name, permissions: required } });
  if (!decision.allowed) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: decision.missingPermission
        ? `Forbidden: missing permission '${decision.missingPermission}'.`
        : 'Forbidden.',
      missingPermission: decision.missingPermission,
    };
  }

  // Validate parameters.
  const parsed = action.parameters.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Invalid action parameters.',
      details: parsed.error.flatten(),
    };
  }

  const risk = inferActionRisk(action);
  const actor = principalActor(principal);
  const audit = opts?.audit ?? defaultAuditSink();

  // Build the service context once so we can reuse it for handler + event emit.
  const ctx = opts?.buildContext
    ? opts.buildContext(principal)
    : createServiceContext(principal, { channelRef: opts?.channelRef });

  // Approval gate
  if (shouldRequireApproval(action, principal, opts)) {
    const approvalReq = await audit.createApprovalRequest({
      actionName: action.name,
      requestedByType: actor.actorType,
      requestedById: actor.actorId,
      risk,
      reason: action.approval?.reason,
      input: parsed.data,
    });
    const exec = await audit.startExecution({
      actionName: action.name,
      actorType: actor.actorType,
      actorId: actor.actorId,
      risk,
      input: parsed.data,
      status: 'PENDING_APPROVAL',
      approvalRequestId: approvalReq.id,
      correlationId: opts?.correlationId,
    });
    await emitEvent(ctx, 'action.approval_requested', {
      actionName: action.name,
      approvalRequestId: approvalReq.id,
      correlationId: opts?.correlationId ?? approvalReq.id,
      payload: { risk, reason: action.approval?.reason, executionId: exec.id },
    });
    // Notify all ADMIN users that an approval is waiting for their decision.
    void ctx.dbClient.user?.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' } })?.then((admins) =>
      Promise.allSettled(
        admins.map((u) =>
          createInboxItem(ctx, {
            recipientUserId: u.id,
            type: 'approval_requested',
            title: `Approval required: ${action.name}`,
            body: action.approval?.reason ?? `A ${risk} action is awaiting your decision.`,
            sourceType: 'ActionApprovalRequest',
            sourceId: approvalReq.id,
            actionUrl: `/approvals/${approvalReq.id}`,
          }),
        ),
      ),
    );
    return {
      ok: true,
      pending: true,
      approvalRequestId: approvalReq.id,
      executionId: exec.id,
      risk,
      reason: action.approval?.reason,
    };
  }

  // Record run
  let execId: string | undefined;
  try {
    const exec = await audit.startExecution({
      actionName: action.name,
      actorType: actor.actorType,
      actorId: actor.actorId,
      risk,
      input: parsed.data,
      status: 'RUNNING',
      approvalRequestId: opts?.approvedRequestId,
      correlationId: opts?.correlationId,
    });
    execId = exec.id;
  } catch {
    // Audit write failure must not break the caller — log and continue.
  }

  const correlationId = opts?.correlationId ?? execId;
  await emitEvent(ctx, 'action.started', {
    actionName: action.name,
    approvalRequestId: opts?.approvedRequestId,
    correlationId,
    payload: { risk, executionId: execId },
  });

  const startedAt = Date.now();
  try {
    const result = (await action.handler(parsed.data, ctx as never)) as T;
    if (execId) {
      try {
        await audit.completeExecution(execId, {
          status: 'COMPLETED',
          output: result,
          durationMs: Date.now() - startedAt,
        });
      } catch {
        /* ignore */
      }
    }
    await emitEvent(ctx, 'action.completed', {
      actionName: action.name,
      approvalRequestId: opts?.approvedRequestId,
      correlationId,
      payload: { risk, executionId: execId, durationMs: Date.now() - startedAt },
    });
    return { ok: true, result, executionId: execId, risk };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (execId) {
      try {
        await audit.completeExecution(execId, {
          status: 'FAILED',
          error: message,
          durationMs: Date.now() - startedAt,
        });
      } catch {
        /* ignore */
      }
    }
    await emitEvent(ctx, 'action.failed', {
      actionName: action.name,
      approvalRequestId: opts?.approvedRequestId,
      correlationId,
      payload: { risk, executionId: execId, error: message },
    });
    return {
      ok: false,
      status: 500,
      code: 'EXECUTION_ERROR',
      message,
      executionId: execId,
    };
  }
}

/**
 * Throwing variant, for callers that prefer exceptions.
 * Throws `Error` with a `.status` and `.code` property attached.
 */
export async function executeAction<T = unknown>(
  name: string,
  params: unknown,
  principal: AuthPrincipal,
  opts?: DispatchOptions,
): Promise<T> {
  const outcome = await dispatchAction<T>(name, params, principal, opts);
  if (!outcome.ok) {
    const err = Object.assign(new Error(outcome.message), {
      status: outcome.status,
      code: outcome.code,
    }) as Error & { status: number; code: string; details?: unknown };
    if ('details' in outcome) err.details = outcome.details;
    throw err;
  }
  if ('pending' in outcome && outcome.pending === true) {
    const pending = outcome as DispatchPendingApproval;
    const err = Object.assign(
      new Error(`Action '${name}' is pending approval (request ${pending.approvalRequestId}).`),
      { status: 202, code: 'PENDING_APPROVAL', approvalRequestId: pending.approvalRequestId },
    ) as Error & { status: number; code: string; approvalRequestId: string };
    throw err;
  }
  return (outcome as DispatchSuccess<T>).result;
}

export { inferActionRisk };
