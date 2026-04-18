/**
 * Connection resolver — what action handlers call via `ctx.getConnection()`.
 *
 * Given an integration key (and optional `connectionId` for multi-instance
 * integrations), returns the resolved, decrypted connection. Enforces:
 *   - The integration is registered
 *   - Scope/multiplicity are consistent with the caller's request
 *   - For ORG-scoped + ACL-gated connections, the caller is allowed
 *   - For USER-scoped connections, the caller IS the owner (or an explicitly
 *     configured delegate — not yet supported; see agents service accounts)
 */
import type { ServiceContext } from '@hq/services';
import type { AuthPrincipal } from '@hq/auth/types';
import { getIntegration } from './registry.js';
import { decryptCredentials } from './encrypt.js';
import type { ResolvedConnection } from './types.js';

export interface GetConnectionOptions {
  /** Required when the integration is `multiplicity: multiple`. */
  connectionId?: string;
  /**
   * For user-scoped integrations when the caller is an agent or bot, set
   * this to the userId whose connection should be used (chain of delegation).
   * Defaults to `ctx.actor.userId` when the caller is a user.
   */
  onBehalfOfUserId?: string;
}

export class IntegrationNotConnectedError extends Error {
  code = 'INTEGRATION_NOT_CONNECTED';
  constructor(public integrationKey: string, message?: string) {
    super(message ?? `No connection found for integration "${integrationKey}".`);
  }
}

export class IntegrationAccessDeniedError extends Error {
  code = 'INTEGRATION_ACCESS_DENIED';
  constructor(public integrationKey: string, message?: string) {
    super(message ?? `Caller is not allowed to use this connection.`);
  }
}

export class IntegrationAmbiguousError extends Error {
  code = 'INTEGRATION_AMBIGUOUS';
  constructor(public integrationKey: string, public connectionIds: string[]) {
    super(
      `Integration "${integrationKey}" has ${connectionIds.length} connections; specify one via connectionId.`,
    );
  }
}

/**
 * Resolve a connection for the current call. Throws one of the error classes
 * above on failure — callers should surface the `.code` to users.
 */
export async function resolveConnection<TCreds = unknown, TMeta = unknown>(
  ctx: ServiceContext,
  integrationKey: string,
  opts?: GetConnectionOptions,
): Promise<ResolvedConnection<TCreds, TMeta>> {
  const def = getIntegration(integrationKey);
  if (!def) {
    throw new Error(`Integration "${integrationKey}" is not registered.`);
  }

  // ── User-scoped: always resolves to ONE specific user's connection ──────────
  if (def.scope === 'user') {
    const ownerUserId = opts?.onBehalfOfUserId ?? (ctx.actor.kind === 'user' ? ctx.actor.userId : null);
    if (!ownerUserId) {
      throw new IntegrationAccessDeniedError(
        integrationKey,
        `User-scoped integration "${integrationKey}" requires a user principal or onBehalfOfUserId.`,
      );
    }
    const row = await ctx.dbClient.integrationConnection.findFirst({
      where: { integrationKey, scope: 'USER', userId: ownerUserId, status: 'ACTIVE' },
    });
    if (!row) throw new IntegrationNotConnectedError(integrationKey);

    return {
      id: row.id,
      integrationKey: row.integrationKey,
      label: row.label,
      scope: 'user',
      userId: row.userId,
      credentials: decryptCredentials<TCreds>(row.credentials),
      metadata: (row.metadata ?? null) as TMeta | null,
    };
  }

  // ── Org-scoped: may be single or multi-instance ─────────────────────────────
  if (opts?.connectionId) {
    const row = await ctx.dbClient.integrationConnection.findUnique({ where: { id: opts.connectionId } });
    if (!row || row.integrationKey !== integrationKey || row.scope !== 'ORG') {
      throw new IntegrationNotConnectedError(integrationKey);
    }
    if (row.status !== 'ACTIVE') {
      throw new IntegrationNotConnectedError(integrationKey, `Connection is ${row.status}.`);
    }
    assertOrgAclAllows(ctx.actor, row);
    return buildResolved<TCreds, TMeta>(row);
  }

  // No connectionId: look for a single active connection.
  const rows = await ctx.dbClient.integrationConnection.findMany({
    where: { integrationKey, scope: 'ORG', status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (rows.length === 0) throw new IntegrationNotConnectedError(integrationKey);
  if (rows.length > 1 && def.multiplicity === 'multiple') {
    throw new IntegrationAmbiguousError(integrationKey, rows.map((r) => r.id));
  }
  const row = rows[0];
  assertOrgAclAllows(ctx.actor, row);
  return buildResolved<TCreds, TMeta>(row);
}

function assertOrgAclAllows(
  actor: AuthPrincipal,
  row: { integrationKey: string; allowedUserIds: string[]; allowedRoles: string[] },
): void {
  // Empty ACL = fall back to role-gated permission.
  if (row.allowedUserIds.length === 0 && row.allowedRoles.length === 0) {
    // Anyone with `integrations.use` can use any non-ACL'd connection.
    // (We deliberately keep this generous — most teams want shared org
    // connections available to all members. Use ACLs to narrow.)
    if (actor.kind === 'user' || actor.kind === 'agent' || actor.kind === 'bot') return;
    throw new IntegrationAccessDeniedError(row.integrationKey);
  }
  if (actor.kind === 'user') {
    if (row.allowedUserIds.includes(actor.userId)) return;
    if (row.allowedRoles.includes(actor.effectiveRole)) return;
  }
  if (actor.kind === 'agent' || actor.kind === 'bot') {
    // Agents and bots running unattended can only use non-ACL'd org connections.
    // To use an ACL'd connection, wrap the call in a user's authenticated session.
    throw new IntegrationAccessDeniedError(
      row.integrationKey,
      `This connection is ACL-restricted. Agents/bots must be delegated by an allowed user.`,
    );
  }
  throw new IntegrationAccessDeniedError(row.integrationKey);
}

function buildResolved<TCreds, TMeta>(row: {
  id: string;
  integrationKey: string;
  label: string;
  scope: string;
  userId: string | null;
  credentials: string;
  metadata: unknown;
}): ResolvedConnection<TCreds, TMeta> {
  return {
    id: row.id,
    integrationKey: row.integrationKey,
    label: row.label,
    scope: row.scope === 'ORG' ? 'org' : 'user',
    userId: row.userId,
    credentials: decryptCredentials<TCreds>(row.credentials),
    metadata: (row.metadata ?? null) as TMeta | null,
  };
}

/**
 * Record that a connection was used. Fire-and-forget; errors are swallowed.
 * Called by the dispatcher after a successful action run.
 */
export function markConnectionUsed(ctx: ServiceContext, connectionId: string): void {
  void ctx.dbClient.integrationConnection
    .update({ where: { id: connectionId }, data: { lastUsedAt: ctx.now() } })
    .catch(() => {});
}
