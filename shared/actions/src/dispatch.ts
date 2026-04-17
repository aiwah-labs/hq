/**
 * Action dispatcher
 *
 * One entry point for executing a registered action. Handles:
 *  - Principal-level authorization via the policy engine (uses action scopes
 *    as permission keys when the key matches the `{object}.{op}` shape).
 *  - Parameter validation against the zod schema.
 *  - Building a ServiceContext from the principal.
 *  - Invoking the action handler.
 *
 * Every surface that executes actions (HTTP, MCP, workflow steps, agent runs)
 * should funnel through `dispatchAction` so policy is applied consistently.
 */
import type { AuthPrincipal, PermissionKey } from '@hq/auth/types';
import { can } from '@hq/auth/policy';
import { createServiceContext, type ServiceContext } from '@hq/services';
import { actionRegistry } from './registry.js';
import type { ActionDefinition } from './types.js';

export interface DispatchOptions {
  /** Override the registry lookup — useful for testing. */
  registry?: { get(name: string): ActionDefinition | undefined };
  /** Override the service context factory (tests). */
  buildContext?: (principal: AuthPrincipal) => ServiceContext;
  /** Optional channel ref to thread through to the context. */
  channelRef?: string;
}

export type DispatchFailure =
  | { ok: false; status: 404; code: 'NOT_FOUND'; message: string }
  | { ok: false; status: 403; code: 'FORBIDDEN'; message: string; missingPermission?: PermissionKey }
  | { ok: false; status: 400; code: 'BAD_REQUEST'; message: string; details?: unknown };

export interface DispatchSuccess<T = unknown> {
  ok: true;
  result: T;
}

export type DispatchResult<T = unknown> = DispatchSuccess<T> | DispatchFailure;

/**
 * Resolve the permissions required by this action. We intentionally mirror
 * `action.scopes` into permission keys — an action declares what it needs
 * (`task.update`, `actions.execute`, …) and the policy engine is the single
 * source of truth for whether the principal has that permission.
 */
function requiredPermissions(action: ActionDefinition): PermissionKey[] {
  return (action.scopes ?? []) as PermissionKey[];
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

  // Build context.
  const ctx = opts?.buildContext
    ? opts.buildContext(principal)
    : createServiceContext(principal, { channelRef: opts?.channelRef });

  // Invoke.
  const result = (await action.handler(parsed.data, ctx as never)) as T;
  return { ok: true, result };
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
  if (outcome.ok) return outcome.result;
  const err = Object.assign(new Error(outcome.message), {
    status: outcome.status,
    code: outcome.code,
  }) as Error & { status: number; code: string; details?: unknown };
  if ('details' in outcome) err.details = outcome.details;
  throw err;
}
