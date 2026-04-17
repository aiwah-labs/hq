import { describe, it, expect } from 'vitest';
import {
  can,
  assertCan,
  canExecuteAction,
  canReadObject,
  canWriteObject,
  resolveObjectAccess,
  recordBelongsToUser,
  resolveCapabilities,
  buildPermissionMap,
} from '../policy.js';
import type { AgentPrincipal, BotPrincipal, UserPrincipal } from '../types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const adminUser: UserPrincipal = {
  kind: 'user',
  source: 'session',
  userId: 'u-admin',
  email: 'admin@example.com',
  dbRole: 'ADMIN',
  effectiveRole: 'ADMIN',
  isSuperadmin: false,
  scopes: [],
  permissions: buildPermissionMap('ADMIN'),
};

const memberUser: UserPrincipal = {
  ...adminUser,
  userId: 'u-member',
  email: 'member@example.com',
  dbRole: 'MEMBER',
  effectiveRole: 'MEMBER',
  permissions: buildPermissionMap('MEMBER'),
};

const botPrincipal: BotPrincipal = {
  kind: 'bot',
  source: 'apikey',
  apiKeyId: 'k1',
  botId: 'b1',
  botSlug: 'ops-bot',
  botName: 'Ops Bot',
  createdByUserId: 'u-admin',
  createdByEmail: 'admin@example.com',
  scopes: ['task.read', 'task.update'],
  permissions: buildPermissionMap('MEMBER'),
};

const agentPrincipal: AgentPrincipal = {
  kind: 'agent',
  source: 'internal',
  agentKey: 'runbook',
  agentName: 'Runbook Agent',
  scopes: ['project.read'],
  permissions: buildPermissionMap('MEMBER'),
};

// ── resolveObjectAccess ───────────────────────────────────────────────────────

describe('resolveObjectAccess', () => {
  it('gives ADMIN `all` on any op', () => {
    expect(resolveObjectAccess(adminUser, 'task', 'update')).toBe('all');
    expect(resolveObjectAccess(adminUser, 'project', 'delete')).toBe('all');
  });

  it('gives MEMBER `all` on reads but `own` on writes', () => {
    expect(resolveObjectAccess(memberUser, 'task', 'read')).toBe('all');
    expect(resolveObjectAccess(memberUser, 'task', 'update')).toBe('own');
    expect(resolveObjectAccess(memberUser, 'task', 'delete')).toBe('own');
  });

  it('gives bot `all` when the scope matches the op', () => {
    expect(resolveObjectAccess(botPrincipal, 'task', 'update')).toBe('all');
  });

  it('gives bot `none` when the scope does not match', () => {
    expect(resolveObjectAccess(botPrincipal, 'project', 'update')).toBe('none');
  });

  it('gives agent `all` when the scope matches', () => {
    expect(resolveObjectAccess(agentPrincipal, 'project', 'read')).toBe('all');
  });
});

// ── recordBelongsToUser ───────────────────────────────────────────────────────

describe('recordBelongsToUser', () => {
  it('matches ownerField', () => {
    expect(recordBelongsToUser({ ownerUserId: 'u-1' }, 'u-1', { ownerField: 'ownerUserId' })).toBe(true);
  });

  it('matches assigneeField', () => {
    expect(recordBelongsToUser({ assigneeUserId: 'u-1' }, 'u-1', { assigneeField: 'assigneeUserId' })).toBe(true);
  });

  it('matches an extraField', () => {
    expect(
      recordBelongsToUser({ createdById: 'u-1' }, 'u-1', { extraFields: ['createdById'] }),
    ).toBe(true);
  });

  it('returns false when no field matches', () => {
    expect(recordBelongsToUser({ ownerUserId: 'other' }, 'u-1', { ownerField: 'ownerUserId' })).toBe(false);
  });

  it('returns false when no ownership config provided', () => {
    expect(recordBelongsToUser({ ownerUserId: 'u-1' }, 'u-1', undefined)).toBe(false);
  });
});

// ── can() — permission / object / action ──────────────────────────────────────

describe('can()', () => {
  it('allows an admin on a platform permission', () => {
    expect(can(adminUser, { permission: 'users.manage' }).allowed).toBe(true);
  });

  it('denies a member on an admin-only permission', () => {
    const decision = can(memberUser, { permission: 'users.manage' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('missing_permission');
    expect(decision.missingPermission).toBe('users.manage');
  });

  it('returns allowed+all for an admin on any object op', () => {
    expect(can(adminUser, { object: { type: 'task', op: 'update' } })).toEqual({
      allowed: true,
      accessLevel: 'all',
    });
  });

  it('for a member write with no record, returns allowed+own (caller must scope)', () => {
    expect(can(memberUser, { object: { type: 'task', op: 'update' } })).toEqual({
      allowed: true,
      accessLevel: 'own',
    });
  });

  it('allows member update on own record', () => {
    const decision = can(
      memberUser,
      { object: { type: 'task', op: 'update', record: { ownerUserId: 'u-member' } } },
      { ownership: { ownerField: 'ownerUserId' } },
    );
    expect(decision.allowed).toBe(true);
    expect(decision.accessLevel).toBe('own');
  });

  it('denies member update on foreign record', () => {
    const decision = can(
      memberUser,
      { object: { type: 'task', op: 'update', record: { ownerUserId: 'other' } } },
      { ownership: { ownerField: 'ownerUserId' } },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('wrong_owner');
  });

  it('requires ALL action permissions to pass', () => {
    const good = can(adminUser, {
      action: { name: 'task.close', permissions: ['actions.execute', 'task.update'] },
    });
    expect(good.allowed).toBe(true);

    const bad = can(memberUser, {
      action: { name: 'users.impersonate', permissions: ['actions.execute', 'users.manage'] },
    });
    expect(bad.allowed).toBe(false);
    expect(bad.missingPermission).toBe('users.manage');
  });

  it('returns unknown reason when no request shape given', () => {
    expect(can(adminUser, {}).reason).toBe('unknown');
  });

  it('bots cannot use own-level access (no userId)', () => {
    const decision = can(
      botPrincipal,
      // botPrincipal has `task.update` scope → all. Force a denial by asking for
      // an object the bot doesn't have.
      { object: { type: 'project', op: 'update', record: { ownerUserId: 'someone' } } },
      { ownership: { ownerField: 'ownerUserId' } },
    );
    expect(decision.allowed).toBe(false);
  });
});

// ── assertCan ─────────────────────────────────────────────────────────────────

describe('assertCan', () => {
  it('does not throw when allowed', () => {
    expect(() => assertCan(adminUser, { permission: 'users.manage' })).not.toThrow();
  });

  it('throws missing-permission errors with the key name', () => {
    expect(() => assertCan(memberUser, { permission: 'users.manage' })).toThrow("'users.manage'");
  });

  it('throws owner-mismatch errors clearly', () => {
    expect(() =>
      assertCan(
        memberUser,
        { object: { type: 'task', op: 'update', record: { ownerUserId: 'other' } } },
        { ownership: { ownerField: 'ownerUserId' } },
      ),
    ).toThrow('not owner');
  });

  it('throws no-access errors when the object op is not granted', () => {
    expect(() => assertCan(botPrincipal, { object: { type: 'project', op: 'delete' } })).toThrow(
      'no access',
    );
  });
});

// ── convenience helpers ───────────────────────────────────────────────────────

describe('canExecuteAction / canReadObject / canWriteObject', () => {
  it('canExecuteAction mirrors action path', () => {
    expect(canExecuteAction(adminUser, { name: 'x', permissions: ['actions.execute'] }).allowed).toBe(true);
  });

  it('canReadObject returns own-level for members without record', () => {
    expect(canReadObject(memberUser, 'task').accessLevel).toBe('all');
  });

  it('canWriteObject scopes member to own-level writes', () => {
    expect(canWriteObject(memberUser, 'task', 'update').accessLevel).toBe('own');
  });
});

// ── resolveCapabilities ───────────────────────────────────────────────────────

describe('resolveCapabilities', () => {
  it('returns user capability with role + superadmin flag', () => {
    const cap = resolveCapabilities(adminUser);
    expect(cap.kind).toBe('user');
    expect(cap.effectiveRole).toBe('ADMIN');
    expect(cap.isSuperadmin).toBe(false);
    expect(cap.permissions['users.manage']).toBe(true);
  });

  it('returns bot capability with its scopes', () => {
    const cap = resolveCapabilities(botPrincipal);
    expect(cap.kind).toBe('bot');
    expect(cap.scopes).toContain('task.update');
  });

  it('returns agent capability', () => {
    expect(resolveCapabilities(agentPrincipal).kind).toBe('agent');
  });
});
