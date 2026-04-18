import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserPrincipal, AgentPrincipal } from '@hq/auth/types';
import type { ServiceContext } from '@hq/services';
import {
  createConnection,
  listConnections,
  deleteConnection,
  updateConnection,
} from '../connections.js';
import { registerIntegration, resetIntegrationRegistry } from '../registry.js';

const adminPerms = {
  'integrations.manage': true,
  'integrations.view': true,
  'users.manage': true,
};
const memberPerms = {
  'integrations.view': true,
  'integrations.manage': false,
};

const admin: UserPrincipal = {
  kind: 'user', source: 'session',
  userId: 'u_admin', email: 'a@t.com',
  dbRole: 'ADMIN', effectiveRole: 'ADMIN',
  isSuperadmin: false, scopes: [], permissions: adminPerms,
};
const member: UserPrincipal = {
  kind: 'user', source: 'session',
  userId: 'u_mem', email: 'm@t.com',
  dbRole: 'MEMBER', effectiveRole: 'MEMBER',
  isSuperadmin: false, scopes: [], permissions: memberPerms,
};
const agent: AgentPrincipal = {
  kind: 'agent', source: 'internal',
  agentKey: 'k', agentName: 'A', scopes: [], permissions: {},
};

function makeCtx(actor: UserPrincipal | AgentPrincipal, rows: any[]): ServiceContext {
  return {
    actor,
    dbClient: {
      integrationConnection: {
        findFirst: vi.fn(async ({ where }: any) =>
          rows.find(
            (r) =>
              r.integrationKey === where.integrationKey &&
              (!where.userId || r.userId === where.userId) &&
              (!where.status || (where.status.not ? r.status !== where.status.not : r.status === where.status)),
          ) ?? null,
        ),
        findUnique: vi.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
        findMany: vi.fn(async ({ where }: any) => {
          return rows.filter((r) => {
            if (where.integrationKey && r.integrationKey !== where.integrationKey) return false;
            if (where.scope && r.scope !== (where.scope === 'org' ? 'ORG' : 'USER')) return false;
            if (where.OR) {
              return where.OR.some((cond: any) => {
                if (cond.scope && r.scope !== cond.scope) return false;
                if (cond.userId && r.userId !== cond.userId) return false;
                return true;
              });
            }
            return true;
          });
        }),
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `conn_${rows.length + 1}`, ...data, createdAt: new Date() };
          rows.push(row);
          return row;
        }),
        delete: vi.fn(async ({ where }: any) => {
          const idx = rows.findIndex((r) => r.id === where.id);
          if (idx >= 0) rows.splice(idx, 1);
          return {};
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = rows.find((r) => r.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        }),
      },
    } as any,
    now: () => new Date(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

describe('connections service', () => {
  beforeEach(() => {
    resetIntegrationRegistry();
    registerIntegration({
      key: 'demo',
      name: 'Demo',
      description: 'd',
      scope: 'org',
      multiplicity: 'single',
      auth: { kind: 'static', fields: [{ name: 'apiKey', label: 'K', type: 'password' }] },
    });
    registerIntegration({
      key: 'gh',
      name: 'GitHub',
      description: 'g',
      scope: 'user',
      multiplicity: 'single',
      auth: {
        kind: 'oauth',
        authorizeUrl: 'https://x/a',
        tokenUrl: 'https://x/t',
        scopes: [],
        clientIdEnv: 'X_ID',
        clientSecretEnv: 'X_SEC',
      },
    });
  });

  it('admins can create org-scoped connections', async () => {
    const ctx = makeCtx(admin, []);
    const created = await createConnection(ctx, {
      integrationKey: 'demo',
      label: 'Prod',
      credentials: { apiKey: 'x' },
    });
    expect(created.id).toBe('conn_1');
  });

  it('members cannot create org-scoped connections', async () => {
    const ctx = makeCtx(member, []);
    await expect(
      createConnection(ctx, {
        integrationKey: 'demo',
        label: 'P',
        credentials: { apiKey: 'x' },
      }),
    ).rejects.toThrow(/Permission denied/);
  });

  it('rejects non-user actors', async () => {
    const ctx = makeCtx(agent, []);
    await expect(
      createConnection(ctx, {
        integrationKey: 'demo',
        label: 'P',
        credentials: { apiKey: 'x' },
      }),
    ).rejects.toThrow(/user principals/);
  });

  it('enforces single-multiplicity', async () => {
    const rows: any[] = [];
    const ctx = makeCtx(admin, rows);
    await createConnection(ctx, {
      integrationKey: 'demo',
      label: 'A',
      credentials: { apiKey: '1' },
    });
    rows[0].status = 'ACTIVE'; // simulate DB default
    await expect(
      createConnection(ctx, {
        integrationKey: 'demo',
        label: 'B',
        credentials: { apiKey: '2' },
      }),
    ).rejects.toThrow(/single-instance/);
  });

  it('members can list own user-scoped connections', async () => {
    const ctx = makeCtx(member, [
      {
        id: 'c1',
        integrationKey: 'gh',
        label: 'Mine',
        scope: 'USER',
        userId: 'u_mem',
        status: 'ACTIVE',
        credentials: 'x',
        metadata: null,
        lastUsedAt: null,
        lastError: null,
        allowedUserIds: [],
        allowedRoles: [],
        createdAt: new Date(),
      },
    ]);
    const list = await listConnections(ctx);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('c1');
    expect(list[0]).not.toHaveProperty('credentials');
  });

  it('members cannot delete another user\'s user-scoped connection', async () => {
    const rows = [
      {
        id: 'c1', integrationKey: 'gh', scope: 'USER', userId: 'u_admin',
        status: 'ACTIVE', credentials: 'x',
      },
    ];
    const ctx = makeCtx(member, rows);
    await expect(deleteConnection(ctx, 'c1')).rejects.toThrow(/own user-scoped/);
  });

  it('forbids ACL updates on user-scoped connections', async () => {
    const rows = [
      {
        id: 'c1', integrationKey: 'gh', scope: 'USER', userId: 'u_mem',
        status: 'ACTIVE', credentials: 'x',
      },
    ];
    const ctx = makeCtx(admin, rows);
    await expect(
      updateConnection(ctx, { id: 'c1', allowedUserIds: ['x'] }),
    ).rejects.toThrow(/cannot have an ACL/);
  });
});
