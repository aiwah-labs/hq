/**
 * Connection CRUD service.
 *
 * All functions take a `ServiceContext` so they can be called from the API,
 * Workshop server actions, or workflow nodes with the same auth semantics.
 *
 * Permission rules:
 *   - Creating an ORG-scoped connection requires `integrations.manage`.
 *   - Creating a USER-scoped connection requires only that the caller IS
 *     that user (no admin needed — each user manages their own).
 *   - Listing ORG-scoped connections requires `integrations.view`.
 *   - Listing USER-scoped connections only returns the caller's own.
 *   - Deleting follows the same rules as creating.
 */
import type { ServiceContext } from '@hq/services';
import { can } from '@hq/auth/policy';
import type { PermissionKey } from '@hq/auth/types';
import { getIntegration } from './registry.js';
import { encryptCredentials, decryptCredentials } from './encrypt.js';
import type { IntegrationScope } from './types.js';

const INTEGRATIONS_MANAGE: PermissionKey = 'integrations.manage';
const INTEGRATIONS_VIEW: PermissionKey = 'integrations.view';

export interface CreateConnectionInput {
  integrationKey: string;
  label: string;
  credentials: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Only meaningful for ORG-scoped integrations. */
  allowedUserIds?: string[];
  allowedRoles?: string[];
  /** For USER-scoped integrations, defaults to the calling user. */
  userId?: string;
}

function requireUserActor(ctx: ServiceContext): string {
  if (ctx.actor.kind !== 'user') {
    throw new Error('Integrations can only be managed by user principals.');
  }
  return ctx.actor.userId;
}

function assertScopePermission(ctx: ServiceContext, scope: IntegrationScope, requiredPerm: PermissionKey): void {
  if (scope === 'user') return; // user-scoped: caller identity is the gate
  const decision = can(ctx.actor, { permission: requiredPerm });
  if (!decision.allowed) {
    throw new Error(`Permission denied: ${requiredPerm} is required to manage org-scoped integrations.`);
  }
}

export async function createConnection(ctx: ServiceContext, input: CreateConnectionInput) {
  const userId = requireUserActor(ctx);
  const def = getIntegration(input.integrationKey);
  if (!def) throw new Error(`Unknown integration "${input.integrationKey}".`);

  assertScopePermission(ctx, def.scope, INTEGRATIONS_MANAGE);

  // Enforce multiplicity and scope resolution.
  const scope: IntegrationScope = def.scope;
  const ownerUserId = scope === 'user' ? (input.userId ?? userId) : null;
  if (scope === 'user' && ownerUserId !== userId && !ctx.actor.permissions['users.manage']) {
    throw new Error('Only admins can connect a user-scoped integration on behalf of another user.');
  }

  if (def.multiplicity === 'single') {
    const existing = await ctx.dbClient.integrationConnection.findFirst({
      where: {
        integrationKey: def.key,
        userId: ownerUserId,
        status: { not: 'REVOKED' },
      },
    });
    if (existing) {
      throw new Error(
        `Integration "${def.key}" is single-instance and already has a connection (${existing.label}). Delete it first.`,
      );
    }
  }

  const encrypted = encryptCredentials(input.credentials);

  return ctx.dbClient.integrationConnection.create({
    data: {
      integrationKey: def.key,
      label: input.label,
      scope: scope === 'org' ? 'ORG' : 'USER',
      userId: ownerUserId,
      credentials: encrypted,
      metadata: input.metadata ?? undefined,
      allowedUserIds: scope === 'org' ? (input.allowedUserIds ?? []) : [],
      allowedRoles: scope === 'org' ? (input.allowedRoles ?? []) : [],
      createdByUserId: userId,
    },
  });
}

export interface ListConnectionsOptions {
  integrationKey?: string;
  scope?: IntegrationScope;
}

export async function listConnections(ctx: ServiceContext, opts?: ListConnectionsOptions) {
  requireUserActor(ctx);
  const userId = ctx.actor.kind === 'user' ? ctx.actor.userId : null;

  // Users with integrations.view see org-scoped. Everyone sees their own user-scoped.
  const hasViewPerm = can(ctx.actor, { permission: INTEGRATIONS_VIEW }).allowed;

  const orFilters: Array<Record<string, unknown>> = [];
  if (hasViewPerm) orFilters.push({ scope: 'ORG' });
  if (userId) orFilters.push({ scope: 'USER', userId });

  if (orFilters.length === 0) return [];

  const rows = await ctx.dbClient.integrationConnection.findMany({
    where: {
      ...(opts?.integrationKey ? { integrationKey: opts.integrationKey } : {}),
      ...(opts?.scope ? { scope: opts.scope === 'org' ? 'ORG' : 'USER' } : {}),
      OR: orFilters,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Strip credentials from the list view; callers that need them use getConnection().
  return rows.map((row) => ({
    id: row.id,
    integrationKey: row.integrationKey,
    label: row.label,
    scope: row.scope,
    userId: row.userId,
    metadata: row.metadata,
    status: row.status,
    lastUsedAt: row.lastUsedAt,
    lastError: row.lastError,
    allowedUserIds: row.allowedUserIds,
    allowedRoles: row.allowedRoles,
    createdAt: row.createdAt,
  }));
}

export async function deleteConnection(ctx: ServiceContext, id: string) {
  const userId = requireUserActor(ctx);
  const row = await ctx.dbClient.integrationConnection.findUnique({ where: { id } });
  if (!row) throw new Error('Connection not found.');

  if (row.scope === 'USER') {
    if (row.userId !== userId && !ctx.actor.permissions['users.manage']) {
      throw new Error('You can only delete your own user-scoped connections.');
    }
  } else {
    assertScopePermission(ctx, 'org', INTEGRATIONS_MANAGE);
  }

  await ctx.dbClient.integrationConnection.delete({ where: { id } });
  return { id };
}

export interface UpdateConnectionAclInput {
  id: string;
  allowedUserIds?: string[];
  allowedRoles?: string[];
  label?: string;
}

export async function updateConnection(ctx: ServiceContext, input: UpdateConnectionAclInput) {
  requireUserActor(ctx);
  const row = await ctx.dbClient.integrationConnection.findUnique({ where: { id: input.id } });
  if (!row) throw new Error('Connection not found.');

  if (row.scope === 'USER') {
    throw new Error('User-scoped connections cannot have an ACL; delete and reconnect instead.');
  }
  assertScopePermission(ctx, 'org', INTEGRATIONS_MANAGE);

  return ctx.dbClient.integrationConnection.update({
    where: { id: input.id },
    data: {
      ...(input.allowedUserIds !== undefined ? { allowedUserIds: input.allowedUserIds } : {}),
      ...(input.allowedRoles !== undefined ? { allowedRoles: input.allowedRoles } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
    },
  });
}

/** Low-level read used by the resolver. Exports the raw row with decrypted credentials. */
export async function readConnectionInternal(ctx: ServiceContext, id: string) {
  const row = await ctx.dbClient.integrationConnection.findUnique({ where: { id } });
  if (!row) return null;
  const credentials = decryptCredentials(row.credentials);
  return { row, credentials };
}
