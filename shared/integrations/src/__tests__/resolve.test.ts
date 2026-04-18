import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserPrincipal, AgentPrincipal, BotPrincipal } from '@hq/auth/types';
import type { ServiceContext } from '@hq/services';
import {
  resolveConnection,
  IntegrationNotConnectedError,
  IntegrationAccessDeniedError,
  IntegrationAmbiguousError,
} from '../resolve.js';
import { registerIntegration, resetIntegrationRegistry } from '../registry.js';
import { encryptCredentials } from '../encrypt.js';

const noPerms = {} as Record<string, boolean>;

const adminUser: UserPrincipal = {
  kind: 'user', source: 'session',
  userId: 'u_admin', email: 'admin@test.com',
  dbRole: 'ADMIN', effectiveRole: 'ADMIN',
  isSuperadmin: false, scopes: [], permissions: noPerms,
};
const memberUser: UserPrincipal = {
  kind: 'user', source: 'session',
  userId: 'u_member', email: 'm@test.com',
  dbRole: 'MEMBER', effectiveRole: 'MEMBER',
  isSuperadmin: false, scopes: [], permissions: noPerms,
};
const agent: AgentPrincipal = {
  kind: 'agent', source: 'internal',
  agentKey: 'sales-bot', agentName: 'Sales Bot',
  scopes: [], permissions: noPerms,
};
const bot: BotPrincipal = {
  kind: 'bot', source: 'apikey',
  apiKeyId: 'k1', botId: 'b1', botSlug: 'my-bot', botName: 'Bot',
  createdByUserId: 'u1', createdByEmail: 'a@b.com',
  scopes: [], permissions: noPerms,
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn_1',
    integrationKey: 'demo',
    label: 'Main',
    scope: 'ORG',
    userId: null,
    status: 'ACTIVE',
    credentials: encryptCredentials({ apiKey: 'sk_demo' }),
    metadata: null,
    allowedUserIds: [],
    allowedRoles: [],
    ...overrides,
  };
}

function makeCtx(actor: UserPrincipal | AgentPrincipal | BotPrincipal, rows: any[]): ServiceContext {
  return {
    actor,
    dbClient: {
      integrationConnection: {
        findFirst: vi.fn(async ({ where }: any) =>
          rows.find((r) =>
            r.integrationKey === where.integrationKey &&
            (where.scope === undefined || r.scope === where.scope) &&
            (where.userId === undefined || r.userId === where.userId) &&
            (where.status === undefined || r.status === where.status),
          ) ?? null,
        ),
        findUnique: vi.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
        findMany: vi.fn(async ({ where }: any) =>
          rows.filter(
            (r) =>
              r.integrationKey === where.integrationKey &&
              r.scope === where.scope &&
              r.status === where.status,
          ),
        ),
        update: vi.fn(async () => ({})),
      },
    } as any,
    now: () => new Date('2024-01-01T00:00:00Z'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

describe('resolveConnection — org scope', () => {
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
  });

  it('returns the single active ORG connection for a permitted user', async () => {
    const ctx = makeCtx(memberUser, [makeRow()]);
    const out = await resolveConnection<{ apiKey: string }>(ctx, 'demo');
    expect(out.id).toBe('conn_1');
    expect(out.credentials.apiKey).toBe('sk_demo');
    expect(out.scope).toBe('org');
  });

  it('throws IntegrationNotConnectedError when no active row exists', async () => {
    const ctx = makeCtx(memberUser, []);
    await expect(resolveConnection(ctx, 'demo')).rejects.toBeInstanceOf(IntegrationNotConnectedError);
  });

  it('throws when the integration key is not registered', async () => {
    const ctx = makeCtx(memberUser, []);
    await expect(resolveConnection(ctx, 'not-real')).rejects.toThrow(/not registered/);
  });

  it('throws IntegrationAmbiguousError when multi-instance and no connectionId given', async () => {
    resetIntegrationRegistry();
    registerIntegration({
      key: 'demo',
      name: 'Demo',
      description: 'd',
      scope: 'org',
      multiplicity: 'multiple',
      auth: { kind: 'static', fields: [{ name: 'apiKey', label: 'K', type: 'password' }] },
    });
    const ctx = makeCtx(memberUser, [
      makeRow({ id: 'conn_a', label: 'A' }),
      makeRow({ id: 'conn_b', label: 'B' }),
    ]);
    await expect(resolveConnection(ctx, 'demo')).rejects.toBeInstanceOf(IntegrationAmbiguousError);
  });

  it('resolves a specific connection by id', async () => {
    const ctx = makeCtx(memberUser, [makeRow({ id: 'conn_a' }), makeRow({ id: 'conn_b' })]);
    const out = await resolveConnection(ctx, 'demo', { connectionId: 'conn_b' });
    expect(out.id).toBe('conn_b');
  });

  it('treats non-ACTIVE connections as not connected', async () => {
    const ctx = makeCtx(memberUser, [makeRow({ status: 'EXPIRED' })]);
    await expect(resolveConnection(ctx, 'demo', { connectionId: 'conn_1' })).rejects.toBeInstanceOf(
      IntegrationNotConnectedError,
    );
  });

  it('allows agents on non-ACL connections (empty ACL = generous)', async () => {
    const ctx = makeCtx(agent, [makeRow()]);
    const out = await resolveConnection(ctx, 'demo');
    expect(out.id).toBe('conn_1');
  });

  it('denies agents on ACL-restricted connections', async () => {
    const ctx = makeCtx(agent, [makeRow({ allowedUserIds: ['u_admin'] })]);
    await expect(resolveConnection(ctx, 'demo')).rejects.toBeInstanceOf(IntegrationAccessDeniedError);
  });

  it('denies bots on ACL-restricted connections', async () => {
    const ctx = makeCtx(bot, [makeRow({ allowedRoles: ['ADMIN'] })]);
    await expect(resolveConnection(ctx, 'demo')).rejects.toBeInstanceOf(IntegrationAccessDeniedError);
  });

  it('allows users listed in allowedUserIds', async () => {
    const ctx = makeCtx(memberUser, [makeRow({ allowedUserIds: ['u_member'] })]);
    const out = await resolveConnection(ctx, 'demo');
    expect(out.id).toBe('conn_1');
  });

  it('denies users not on the ACL', async () => {
    const ctx = makeCtx(memberUser, [makeRow({ allowedUserIds: ['someone-else'] })]);
    await expect(resolveConnection(ctx, 'demo')).rejects.toBeInstanceOf(IntegrationAccessDeniedError);
  });

  it('allows users whose effectiveRole is in allowedRoles', async () => {
    const ctx = makeCtx(adminUser, [makeRow({ allowedRoles: ['ADMIN'] })]);
    const out = await resolveConnection(ctx, 'demo');
    expect(out.id).toBe('conn_1');
  });
});

describe('resolveConnection — user scope', () => {
  beforeEach(() => {
    resetIntegrationRegistry();
    registerIntegration({
      key: 'github',
      name: 'GitHub',
      description: 'g',
      scope: 'user',
      multiplicity: 'single',
      auth: {
        kind: 'oauth',
        authorizeUrl: 'https://x/a',
        tokenUrl: 'https://x/t',
        scopes: [],
        clientIdEnv: 'GH_ID',
        clientSecretEnv: 'GH_SECRET',
      },
    });
  });

  it("returns the caller's own user-scoped connection", async () => {
    const ctx = makeCtx(memberUser, [
      makeRow({
        id: 'gh_1',
        integrationKey: 'github',
        scope: 'USER',
        userId: 'u_member',
      }),
    ]);
    const out = await resolveConnection(ctx, 'github');
    expect(out.userId).toBe('u_member');
  });

  it('falls through to IntegrationNotConnectedError if another user has one', async () => {
    const ctx = makeCtx(memberUser, [
      makeRow({ id: 'gh_1', integrationKey: 'github', scope: 'USER', userId: 'u_admin' }),
    ]);
    await expect(resolveConnection(ctx, 'github')).rejects.toBeInstanceOf(IntegrationNotConnectedError);
  });

  it('supports onBehalfOfUserId for agents', async () => {
    const ctx = makeCtx(agent, [
      makeRow({ id: 'gh_1', integrationKey: 'github', scope: 'USER', userId: 'u_member' }),
    ]);
    const out = await resolveConnection(ctx, 'github', { onBehalfOfUserId: 'u_member' });
    expect(out.userId).toBe('u_member');
  });

  it('rejects agents without onBehalfOfUserId', async () => {
    const ctx = makeCtx(agent, []);
    await expect(resolveConnection(ctx, 'github')).rejects.toBeInstanceOf(IntegrationAccessDeniedError);
  });
});
