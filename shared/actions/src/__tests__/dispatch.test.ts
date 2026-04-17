import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { dispatchAction, executeAction } from '../dispatch.js';
import { ActionRegistry } from '../registry.js';
import type { ActionDefinition } from '../types.js';
import { buildPermissionMap } from '@hq/auth/policy';
import type { AuthPrincipal, BotPrincipal, UserPrincipal } from '@hq/auth/types';

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

const scopedBot: BotPrincipal = {
  kind: 'bot',
  source: 'apikey',
  apiKeyId: 'k1',
  botId: 'b1',
  botSlug: 'ops-bot',
  botName: 'Ops Bot',
  createdByUserId: 'u-admin',
  createdByEmail: 'admin@example.com',
  scopes: ['note.read'],
  permissions: buildPermissionMap('MEMBER'),
};

function makeRegistry(action: ActionDefinition) {
  const reg = new ActionRegistry();
  reg.register(action);
  return reg;
}

const echo: ActionDefinition = {
  name: 'test.echo',
  description: 'echo',
  scopes: ['actions.execute'],
  parameters: z.object({ msg: z.string() }),
  handler: async ({ msg }: { msg: string }) => ({ msg }),
};

const requiresManage: ActionDefinition = {
  name: 'test.manage',
  description: 'requires manage',
  scopes: ['users.manage'],
  parameters: z.object({}),
  handler: async () => ({ ok: true }),
};

// A context factory we can use to avoid the real DB wiring.
const fakeCtx = (p: AuthPrincipal) =>
  ({ actor: p, dbClient: {}, now: () => new Date(), logger: console }) as never;

// ── dispatchAction ────────────────────────────────────────────────────────────

describe('dispatchAction', () => {
  it('returns NOT_FOUND for an unknown action', async () => {
    const reg = new ActionRegistry();
    const res = await dispatchAction('missing', {}, adminUser, { registry: reg, buildContext: fakeCtx });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NOT_FOUND');
  });

  it('executes when the principal has all required permissions', async () => {
    const reg = makeRegistry(echo);
    const res = await dispatchAction('test.echo', { msg: 'hi' }, memberUser, {
      registry: reg,
      buildContext: fakeCtx,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result).toEqual({ msg: 'hi' });
  });

  it('returns 403 FORBIDDEN when the principal is missing a permission', async () => {
    const reg = makeRegistry(requiresManage);
    const res = await dispatchAction('test.manage', {}, memberUser, {
      registry: reg,
      buildContext: fakeCtx,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('FORBIDDEN');
      expect(res.status).toBe(403);
      expect(res.missingPermission).toBe('users.manage');
    }
  });

  it('admins bypass permission checks', async () => {
    const reg = makeRegistry(requiresManage);
    const res = await dispatchAction('test.manage', {}, adminUser, {
      registry: reg,
      buildContext: fakeCtx,
    });
    expect(res.ok).toBe(true);
  });

  it('returns 400 BAD_REQUEST when params fail validation', async () => {
    const reg = makeRegistry(echo);
    const res = await dispatchAction('test.echo', { msg: 123 }, adminUser, {
      registry: reg,
      buildContext: fakeCtx,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_REQUEST');
  });

  it('grants bots access when the scope matches', async () => {
    // Note: scoped bots map scopes to keys via their `permissions` map; we
    // exercise the path where the action uses the exact scope name.
    const noteRead: ActionDefinition = {
      name: 'note.read',
      description: 'read notes',
      scopes: ['note.read'],
      parameters: z.object({}),
      handler: async () => ({ notes: [] }),
    };
    const reg = makeRegistry(noteRead);
    const botWithPerm: BotPrincipal = {
      ...scopedBot,
      permissions: { ...buildPermissionMap('MEMBER'), 'note.read': true },
    };
    const res = await dispatchAction('note.read', {}, botWithPerm, {
      registry: reg,
      buildContext: fakeCtx,
    });
    expect(res.ok).toBe(true);
  });
});

// ── executeAction (throwing variant) ──────────────────────────────────────────

describe('executeAction', () => {
  it('throws with status/code for a missing permission', async () => {
    const reg = makeRegistry(requiresManage);
    await expect(
      executeAction('test.manage', {}, memberUser, { registry: reg, buildContext: fakeCtx }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('returns the handler result on success', async () => {
    const reg = makeRegistry(echo);
    const out = await executeAction('test.echo', { msg: 'ok' }, adminUser, {
      registry: reg,
      buildContext: fakeCtx,
    });
    expect(out).toEqual({ msg: 'ok' });
  });
});
