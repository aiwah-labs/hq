import { describe, it, expect } from 'vitest';
import { buildPermissionMap, hasPermission, assertPermission } from '../policy.js';
import type { AgentPrincipal, BotPrincipal, UserPrincipal } from '../types.js';

const noPerms = {
  'workshop.view': false,
  'content.all': false,
  'settings.view': false,
  'users.view': false,
  'users.manage': false,
  'admin.surface': false,
  'bots.view': false,
  'bots.create': false,
  'bots.manage.any': false,
  'messaging.view': false,
} as const;

const allPerms = Object.fromEntries(Object.keys(noPerms).map((k) => [k, true])) as typeof noPerms;

const adminUser: UserPrincipal = {
  kind: 'user', source: 'session',
  userId: 'u1', email: 'a@b.com',
  dbRole: 'ADMIN', effectiveRole: 'ADMIN',
  isSuperadmin: false, scopes: [], permissions: allPerms,
};

const memberUser: UserPrincipal = {
  ...adminUser,
  dbRole: 'MEMBER', effectiveRole: 'MEMBER',
  permissions: buildPermissionMap('MEMBER'),
};

const botPrincipal: BotPrincipal = {
  kind: 'bot', source: 'apikey',
  apiKeyId: 'k1', botId: 'b1', botSlug: 'b', botName: 'B',
  createdByUserId: 'u1', createdByEmail: 'a@b.com',
  scopes: ['note.read'], permissions: noPerms,
};

const agentPrincipal: AgentPrincipal = {
  kind: 'agent', source: 'internal',
  agentKey: 'key', agentName: 'Agent',
  scopes: [], permissions: noPerms,
};

// ── buildPermissionMap ────────────────────────────────────────────────────────

describe('buildPermissionMap', () => {
  it('grants all permissions to ADMIN', () => {
    const perms = buildPermissionMap('ADMIN');
    expect(perms['admin.surface']).toBe(true);
    expect(perms['users.manage']).toBe(true);
    expect(perms['bots.manage.any']).toBe(true);
    expect(Object.values(perms).every(Boolean)).toBe(true);
  });

  it('grants all permissions to SUPERADMIN', () => {
    const perms = buildPermissionMap('SUPERADMIN');
    expect(Object.values(perms).every(Boolean)).toBe(true);
  });

  it('grants limited permissions to MEMBER', () => {
    const perms = buildPermissionMap('MEMBER');
    expect(perms['workshop.view']).toBe(true);
    expect(perms['content.all']).toBe(true);
    expect(perms['bots.view']).toBe(true);
    expect(perms['bots.create']).toBe(true);
    expect(perms['messaging.view']).toBe(true);
  });

  it('denies admin-only permissions for MEMBER', () => {
    const perms = buildPermissionMap('MEMBER');
    expect(perms['users.manage']).toBe(false);
    expect(perms['admin.surface']).toBe(false);
    expect(perms['bots.manage.any']).toBe(false);
  });
});

// ── hasPermission ─────────────────────────────────────────────────────────────

describe('hasPermission', () => {
  it('returns true for user with the permission', () => {
    expect(hasPermission(adminUser, 'admin.surface')).toBe(true);
  });

  it('returns false for user without the permission', () => {
    expect(hasPermission(memberUser, 'admin.surface')).toBe(false);
  });

  it('always returns false for bot principals', () => {
    expect(hasPermission(botPrincipal, 'workshop.view')).toBe(false);
    expect(hasPermission(botPrincipal, 'content.all')).toBe(false);
  });

  it('always returns false for agent principals', () => {
    expect(hasPermission(agentPrincipal, 'workshop.view')).toBe(false);
  });
});

// ── assertPermission ──────────────────────────────────────────────────────────

describe('assertPermission', () => {
  it('does not throw when user has the permission', () => {
    expect(() => assertPermission(adminUser, 'admin.surface')).not.toThrow();
  });

  it('throws with permission name in message', () => {
    expect(() => assertPermission(memberUser, 'users.manage')).toThrow(
      "Forbidden: missing permission 'users.manage'."
    );
  });

  it('throws for bot principals on any permission', () => {
    expect(() => assertPermission(botPrincipal, 'workshop.view')).toThrow('Forbidden');
  });
});
