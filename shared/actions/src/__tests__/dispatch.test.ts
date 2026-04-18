import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { dispatchAction, executeAction, type AuditSink } from '../dispatch.js';
import { ActionRegistry } from '../registry.js';
import { inferActionRisk, type ActionDefinition } from '../types.js';
import { buildPermissionMap } from '@hq/auth/policy';
import type { AuthPrincipal, BotPrincipal, UserPrincipal } from '@hq/auth/types';

/** Null-writing audit sink for unit tests. */
function makeAudit(): AuditSink & {
  executions: Array<{ id: string; status: string; actionName: string }>;
  approvals: Array<{ id: string; actionName: string }>;
} {
  const executions: Array<{ id: string; status: string; actionName: string }> = [];
  const approvals: Array<{ id: string; actionName: string }> = [];
  let idSeq = 0;
  return {
    executions,
    approvals,
    async startExecution(row) {
      const id = `e${++idSeq}`;
      executions.push({ id, status: row.status, actionName: row.actionName });
      return { id };
    },
    async completeExecution(id, patch) {
      const row = executions.find((r) => r.id === id);
      if (row) row.status = patch.status;
    },
    async createApprovalRequest(row) {
      const id = `a${++idSeq}`;
      approvals.push({ id, actionName: row.actionName });
      return { id };
    },
  };
}

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
    const res = await dispatchAction('missing', {}, adminUser, { registry: reg, buildContext: fakeCtx, audit: makeAudit() });
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

// ── Risk inference ───────────────────────────────────────────────────────────

describe('inferActionRisk', () => {
  it('returns explicit risk when declared', () => {
    expect(inferActionRisk({ ...echo, risk: 'high' })).toBe('high');
  });

  it('classifies `.delete` suffix as high risk', () => {
    expect(inferActionRisk({ ...echo, name: 'customer.delete' })).toBe('high');
  });

  it('classifies `.merge` as high risk', () => {
    expect(inferActionRisk({ ...echo, name: 'customer.merge' })).toBe('high');
  });

  it('classifies `.create` / `.update` as medium risk', () => {
    expect(inferActionRisk({ ...echo, name: 'customer.create' })).toBe('medium');
    expect(inferActionRisk({ ...echo, name: 'customer.update' })).toBe('medium');
  });

  it('falls back to low for read-only', () => {
    expect(inferActionRisk({ ...echo, name: 'customer.list' })).toBe('low');
  });

  it('uses objects.writes as a medium-risk signal', () => {
    expect(inferActionRisk({ ...echo, name: 'customer.foo', objects: { writes: ['Customer'] } })).toBe('medium');
  });

  it('uses objects.deletes as a high-risk signal', () => {
    expect(inferActionRisk({ ...echo, name: 'customer.foo', objects: { deletes: ['Customer'] } })).toBe('high');
  });
});

// ── Approval gating ──────────────────────────────────────────────────────────

describe('approval gating', () => {
  const requiresApproval: ActionDefinition = {
    name: 'customer.merge',
    description: 'merge two customers',
    scopes: ['customer.write'],
    parameters: z.object({ a: z.string(), b: z.string() }),
    approval: { required: true, reason: 'Destructive merge — requires human review.' },
    handler: async () => ({ merged: true }),
  };

  it('creates an approval request instead of executing', async () => {
    const reg = makeRegistry(requiresApproval);
    const audit = makeAudit();
    const res = await dispatchAction('customer.merge', { a: '1', b: '2' }, adminUser, {
      registry: reg,
      buildContext: fakeCtx,
      audit,
    });
    expect(res.ok).toBe(true);
    if (res.ok && 'pending' in res) {
      expect(res.pending).toBe(true);
      expect(res.approvalRequestId).toBeDefined();
      expect(res.executionId).toBeDefined();
      expect(res.risk).toBe('high'); // `.merge` is inferred as high
      expect(res.reason).toContain('Destructive');
    }
    expect(audit.approvals.length).toBe(1);
    expect(audit.executions.length).toBe(1);
    expect(audit.executions[0].status).toBe('PENDING_APPROVAL');
  });

  it('skipApproval bypasses the gate (used by approval-decision path)', async () => {
    const reg = makeRegistry(requiresApproval);
    const audit = makeAudit();
    const res = await dispatchAction(
      'customer.merge',
      { a: '1', b: '2' },
      adminUser,
      { registry: reg, buildContext: fakeCtx, audit, skipApproval: true, approvedRequestId: 'a42' },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect('pending' in res).toBe(false);
    // Executed, so audit has one RUNNING → COMPLETED row and no new approval request.
    expect(audit.approvals.length).toBe(0);
    expect(audit.executions.length).toBe(1);
    expect(audit.executions[0].status).toBe('COMPLETED');
  });

  it('bypassScopes lets the caller skip the gate when they hold one', async () => {
    const reg = makeRegistry({
      ...requiresApproval,
      approval: { required: true, bypassScopes: ['approvals.decide'] },
    });
    const audit = makeAudit();
    const admin: UserPrincipal = {
      ...adminUser,
      permissions: { ...buildPermissionMap('ADMIN'), 'approvals.decide': true },
    };
    const res = await dispatchAction('customer.merge', { a: '1', b: '2' }, admin, {
      registry: reg,
      buildContext: fakeCtx,
      audit,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect('pending' in res).toBe(false);
    expect(audit.approvals.length).toBe(0);
  });

  it('handler errors are recorded on the execution row', async () => {
    const failing: ActionDefinition = {
      name: 'test.fail',
      description: 'throws',
      scopes: ['actions.execute'],
      parameters: z.object({}),
      handler: async () => {
        throw new Error('boom');
      },
    };
    const reg = makeRegistry(failing);
    const audit = makeAudit();
    const res = await dispatchAction('test.fail', {}, adminUser, {
      registry: reg,
      buildContext: fakeCtx,
      audit,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('EXECUTION_ERROR');
    expect(audit.executions[0].status).toBe('FAILED');
  });
});

// ── executeAction (throwing variant) ──────────────────────────────────────────

describe('executeAction', () => {
  it('throws with status/code for a missing permission', async () => {
    const reg = makeRegistry(requiresManage);
    await expect(
      executeAction('test.manage', {}, memberUser, { registry: reg, buildContext: fakeCtx, audit: makeAudit() }),
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
