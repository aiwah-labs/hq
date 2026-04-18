/**
 * HQ Policy Engine
 *
 * One decision point for every actor in the system: humans, bots, agents,
 * workflows, MCP clients. Every "can X do Y?" question goes through `can()`.
 *
 * Vocabulary:
 *  - PermissionKey: platform-level capability ("users.manage", "task.read", …).
 *    Split across UI surfaces, object CRUD, actions, and special operations.
 *  - AccessLevel: "all" | "own" | "none". Controls ownership-scoped reads/writes.
 *  - Capability: the answer to "what can this principal do?" — a PermissionMap
 *    plus per-object access levels plus the raw scope set for bots/agents.
 */

import type {
  AgentPrincipal,
  AuthPrincipal,
  BotPrincipal,
  EffectiveRole,
  PermissionKey,
  PermissionMap,
  UserPrincipal,
} from './types.js';

// ─── Static role → permission map ────────────────────────────────────────────

const ADMIN_PERMS: PermissionKey[] = [
  'workshop.view',
  'content.all',
  'settings.view',
  'settings.manage',
  'users.view',
  'users.manage',
  'identity.manage',
  'admin.surface',
  'bots.view',
  'bots.create',
  'bots.manage.any',
  'agents.view',
  'agents.manage',
  'workflows.view',
  'workflows.execute',
  'workflows.manage',
  'approvals.view',
  'approvals.decide',
  'actions.view',
  'actions.execute',
  'audit.view',
  'messaging.view',
  'integrations.view',
  'integrations.manage',
];

const MEMBER_PERMS: PermissionKey[] = [
  'workshop.view',
  'content.all',
  'settings.view',
  'bots.view',
  'bots.create',
  'agents.view',
  'workflows.view',
  'workflows.execute',
  'approvals.view',
  'actions.view',
  'actions.execute',
  'messaging.view',
  'integrations.view',
];

export function buildPermissionMap(role: EffectiveRole): PermissionMap {
  const grants = role === 'MEMBER' ? MEMBER_PERMS : ADMIN_PERMS;
  const set = new Set(grants);
  const all: PermissionKey[] = [
    'workshop.view', 'content.all', 'settings.view', 'settings.manage',
    'users.view', 'users.manage', 'identity.manage', 'admin.surface',
    'bots.view', 'bots.create', 'bots.manage.any',
    'agents.view', 'agents.manage',
    'workflows.view', 'workflows.execute', 'workflows.manage',
    'approvals.view', 'approvals.decide',
    'actions.view', 'actions.execute',
    'audit.view', 'messaging.view',
    'integrations.view', 'integrations.manage',
  ];
  const map = {} as PermissionMap;
  for (const p of all) map[p] = set.has(p);
  return map;
}

// ─── Permission checks (principal-level) ─────────────────────────────────────

export function hasPermission(principal: AuthPrincipal, key: PermissionKey): boolean {
  // Platform admins (and superadmins) pass every permission check — object and
  // platform alike. Ownership checks at the object layer can still narrow the
  // scope where needed (e.g. "only update your own drafts").
  if (
    principal.kind === 'user' &&
    (principal.effectiveRole === 'ADMIN' || principal.effectiveRole === 'SUPERADMIN')
  ) {
    return true;
  }
  return principal.permissions?.[key] === true;
}

export function assertPermission(principal: AuthPrincipal, key: PermissionKey): void {
  if (!hasPermission(principal, key)) {
    throw new Error(`Forbidden: missing permission '${key}'.`);
  }
}

// ─── Ownership-aware access level ────────────────────────────────────────────

export type AccessLevel = 'all' | 'own' | 'none';

/** Resolve the access level this principal has for a given object operation. */
export function resolveObjectAccess(
  principal: AuthPrincipal,
  object: string,
  op: 'read' | 'create' | 'update' | 'delete' | 'bulk',
): AccessLevel {
  const perm = `${object}.${op}` as PermissionKey;

  // Platform admins get `all` across the board.
  if (principal.kind === 'user' && (principal.effectiveRole === 'ADMIN' || principal.effectiveRole === 'SUPERADMIN')) {
    return 'all';
  }

  // Direct permission match wins.
  if (principal.permissions?.[perm] === true) {
    return 'all';
  }

  // Bot/agent scopes: if their scope string matches the object.op exactly, they have `all`.
  if ((principal.kind === 'bot' || principal.kind === 'agent') && principal.scopes.includes(perm as never)) {
    return 'all';
  }

  // Member users default to `own` for non-admin object operations.
  if (principal.kind === 'user' && principal.effectiveRole === 'MEMBER') {
    // Reads are typically open across the workspace; writes default to 'own'.
    if (op === 'read') return 'all';
    return 'own';
  }

  return 'none';
}

// ─── Ownership helpers ───────────────────────────────────────────────────────

export interface OwnershipFields {
  /** Field on the record that stores the owner's userId, e.g. `ownerUserId`. */
  ownerField?: string;
  /** Field on the record that stores the assignee's userId, e.g. `assigneeUserId`. */
  assigneeField?: string;
  /** Arbitrary additional fields that count as "ownership". */
  extraFields?: string[];
}

export function recordBelongsToUser(
  record: Record<string, unknown> | null | undefined,
  userId: string,
  ownership: OwnershipFields | undefined,
): boolean {
  if (!record) return false;
  const fields = [
    ownership?.ownerField,
    ownership?.assigneeField,
    ...(ownership?.extraFields ?? []),
  ].filter((f): f is string => typeof f === 'string' && f.length > 0);
  if (fields.length === 0) return false;
  return fields.some((f) => record[f] === userId);
}

// ─── High-level `can()` API ──────────────────────────────────────────────────

export interface CanRequest {
  /** Shorthand permission key — a check passes if the principal has it. */
  permission?: PermissionKey;
  /** Object-level check: {type, op, record?}. */
  object?: { type: string; op: 'read' | 'create' | 'update' | 'delete' | 'bulk'; record?: Record<string, unknown> };
  /** Action-level check: requires ALL listed permissions. */
  action?: { name: string; permissions?: PermissionKey[] };
}

export interface PolicyDecision {
  allowed: boolean;
  /** `denied` reason when `allowed=false`. */
  reason?: 'missing_permission' | 'wrong_owner' | 'no_access_level' | 'unknown';
  /** For object checks: the resolved access level. */
  accessLevel?: AccessLevel;
  /** For debugging: which permission was missing. */
  missingPermission?: PermissionKey;
}

/** One-shot policy decision. Never throws — inspect `decision.allowed`. */
export function can(
  principal: AuthPrincipal,
  request: CanRequest,
  opts?: { ownership?: OwnershipFields },
): PolicyDecision {
  // Simple permission.
  if (request.permission) {
    const allowed = hasPermission(principal, request.permission);
    return allowed
      ? { allowed: true }
      : { allowed: false, reason: 'missing_permission', missingPermission: request.permission };
  }

  // Object-level.
  if (request.object) {
    const level = resolveObjectAccess(principal, request.object.type, request.object.op);
    if (level === 'none') {
      return { allowed: false, reason: 'no_access_level', accessLevel: 'none' };
    }
    if (level === 'all') {
      return { allowed: true, accessLevel: 'all' };
    }
    // 'own' — need a record to compare against. Without one (e.g. list calls),
    // the decision is "allowed, but the caller should scope by owner".
    if (!request.object.record) {
      return { allowed: true, accessLevel: 'own' };
    }
    if (principal.kind !== 'user') {
      // Bots/agents without `all` cannot use 'own' access — they have no userId.
      return { allowed: false, reason: 'no_access_level', accessLevel: 'own' };
    }
    const ok = recordBelongsToUser(request.object.record, principal.userId, opts?.ownership);
    return ok
      ? { allowed: true, accessLevel: 'own' }
      : { allowed: false, reason: 'wrong_owner', accessLevel: 'own' };
  }

  // Action-level: ALL listed permissions must pass.
  if (request.action) {
    const required = request.action.permissions ?? [];
    for (const p of required) {
      if (!hasPermission(principal, p)) {
        return { allowed: false, reason: 'missing_permission', missingPermission: p };
      }
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'unknown' };
}

export function assertCan(
  principal: AuthPrincipal,
  request: CanRequest,
  opts?: { ownership?: OwnershipFields },
): void {
  const decision = can(principal, request, opts);
  if (decision.allowed) return;
  if (decision.reason === 'missing_permission' && decision.missingPermission) {
    throw new Error(`Forbidden: missing permission '${decision.missingPermission}'.`);
  }
  if (decision.reason === 'wrong_owner') {
    throw new Error('Forbidden: not owner of this record.');
  }
  if (decision.reason === 'no_access_level') {
    throw new Error('Forbidden: no access to this object.');
  }
  throw new Error('Forbidden.');
}

// ─── Convenience helpers used by the dispatcher / object runtime ─────────────

export function canExecuteAction(
  principal: AuthPrincipal,
  action: { name: string; permissions?: PermissionKey[] },
): PolicyDecision {
  return can(principal, { action });
}

export function canReadObject(
  principal: AuthPrincipal,
  type: string,
  record?: Record<string, unknown>,
  ownership?: OwnershipFields,
): PolicyDecision {
  return can(principal, { object: { type, op: 'read', record } }, { ownership });
}

export function canWriteObject(
  principal: AuthPrincipal,
  type: string,
  op: 'create' | 'update' | 'delete' | 'bulk',
  record?: Record<string, unknown>,
  ownership?: OwnershipFields,
): PolicyDecision {
  return can(principal, { object: { type, op, record } }, { ownership });
}

// ─── Resolve full capability set (used by /v1/me/permissions) ────────────────

export interface Capability {
  permissions: PermissionMap;
  scopes: readonly string[];
  effectiveRole?: EffectiveRole;
  kind: AuthPrincipal['kind'];
  isSuperadmin?: boolean;
}

export function resolveCapabilities(principal: AuthPrincipal): Capability {
  if (principal.kind === 'user') {
    const u = principal as UserPrincipal;
    return {
      permissions: u.permissions,
      scopes: u.scopes,
      effectiveRole: u.effectiveRole,
      isSuperadmin: u.isSuperadmin,
      kind: 'user',
    };
  }
  if (principal.kind === 'bot') {
    const b = principal as BotPrincipal;
    return { permissions: b.permissions, scopes: b.scopes, kind: 'bot' };
  }
  const a = principal as AgentPrincipal;
  return { permissions: a.permissions, scopes: a.scopes, kind: 'agent' };
}
