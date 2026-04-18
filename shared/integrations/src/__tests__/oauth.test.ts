import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserPrincipal } from '@hq/auth/types';
import type { ServiceContext } from '@hq/services';
import { startOAuthFlow, completeOAuthFlow, OAuthStateError, OAuthTokenError } from '../oauth.js';
import { registerIntegration, resetIntegrationRegistry } from '../registry.js';
import { encryptCredentials } from '../encrypt.js';

const user: UserPrincipal = {
  kind: 'user', source: 'session',
  userId: 'u1', email: 'a@b.com',
  dbRole: 'MEMBER', effectiveRole: 'MEMBER',
  isSuperadmin: false, scopes: [], permissions: {},
};

function makeCtx(state: Map<string, any>, connections: any[] = []): ServiceContext {
  return {
    actor: user,
    dbClient: {
      oAuthState: {
        create: vi.fn(async ({ data }: any) => {
          state.set(data.state, data);
          return data;
        }),
        findUnique: vi.fn(async ({ where }: any) => state.get(where.state) ?? null),
        delete: vi.fn(async ({ where }: any) => {
          state.delete(where.state);
          return {};
        }),
      },
      integrationConnection: {
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `conn_${connections.length + 1}`, ...data };
          connections.push(row);
          return row;
        }),
        findUnique: vi.fn(async ({ where }: any) =>
          connections.find((c) => c.id === where.id) ?? null,
        ),
        update: vi.fn(async () => ({})),
      },
    } as any,
    now: () => new Date('2024-01-01T00:00:00Z'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

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
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'user:email'],
      clientIdEnv: 'GH_CLIENT_ID',
      clientSecretEnv: 'GH_CLIENT_SECRET',
    },
  });
  process.env.GH_CLIENT_ID = 'client-id-123';
  process.env.GH_CLIENT_SECRET = 'client-secret-abc';
});

afterEach(() => {
  delete process.env.GH_CLIENT_ID;
  delete process.env.GH_CLIENT_SECRET;
  vi.restoreAllMocks();
});

describe('startOAuthFlow', () => {
  it('builds a proper authorize URL with PKCE challenge and persists state', async () => {
    const stateStore = new Map();
    const ctx = makeCtx(stateStore);
    const { authorizeUrl, state } = await startOAuthFlow(ctx, {
      integrationKey: 'github',
      redirectUri: 'https://app.test/callback',
    });
    const url = new URL(authorizeUrl);
    expect(url.searchParams.get('client_id')).toBe('client-id-123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/callback');
    expect(url.searchParams.get('scope')).toBe('repo user:email');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(stateStore.get(state)).toMatchObject({ userId: 'u1', integrationKey: 'github' });
  });

  it('throws when client_id env var is missing', async () => {
    delete process.env.GH_CLIENT_ID;
    const ctx = makeCtx(new Map());
    await expect(
      startOAuthFlow(ctx, { integrationKey: 'github', redirectUri: 'https://x/cb' }),
    ).rejects.toThrow(/Missing OAuth client_id/);
  });

  it('refuses non-OAuth integrations', async () => {
    resetIntegrationRegistry();
    registerIntegration({
      key: 'static-only',
      name: 'Static',
      description: 'x',
      scope: 'org',
      multiplicity: 'single',
      auth: { kind: 'static', fields: [{ name: 'apiKey', label: 'K', type: 'password' }] },
    });
    const ctx = makeCtx(new Map());
    await expect(
      startOAuthFlow(ctx, { integrationKey: 'static-only', redirectUri: 'https://x/cb' }),
    ).rejects.toThrow(/does not use OAuth/);
  });
});

describe('completeOAuthFlow', () => {
  const goodState = {
    state: 's1',
    integrationKey: 'github',
    userId: 'u1',
    codeVerifier: 'verifier',
    redirectUri: 'https://app.test/callback',
    label: 'GH',
    expiresAt: new Date('2024-01-01T00:15:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  it('exchanges the code for tokens and writes an encrypted connection', async () => {
    const stateStore = new Map([[goodState.state, goodState]]);
    const conns: any[] = [];
    const ctx = makeCtx(stateStore, conns);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'tok_abc',
          refresh_token: 'ref_abc',
          token_type: 'bearer',
          expires_in: 3600,
          scope: 'repo',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const out = await completeOAuthFlow(ctx, {
      state: 's1',
      code: 'code_abc',
      redirectUri: goodState.redirectUri,
    });
    expect(out.connectionId).toBe('conn_1');
    expect(out.integrationKey).toBe('github');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(conns[0].userId).toBe('u1');
    expect(conns[0].scope).toBe('USER');
    const credsJson = JSON.parse(conns[0].credentials);
    expect(credsJson.alg).toBeDefined(); // envelope exists
    expect(stateStore.has('s1')).toBe(false); // state consumed
  });

  it('rejects unknown state', async () => {
    const ctx = makeCtx(new Map());
    await expect(
      completeOAuthFlow(ctx, {
        state: 'missing',
        code: 'c',
        redirectUri: 'https://app.test/callback',
      }),
    ).rejects.toBeInstanceOf(OAuthStateError);
  });

  it('rejects expired state', async () => {
    const expired = { ...goodState, expiresAt: new Date('2023-12-31T23:00:00Z') };
    const ctx = makeCtx(new Map([[expired.state, expired]]));
    await expect(
      completeOAuthFlow(ctx, {
        state: expired.state,
        code: 'c',
        redirectUri: expired.redirectUri,
      }),
    ).rejects.toThrow(/expired/);
  });

  it('rejects redirect_uri mismatch', async () => {
    const ctx = makeCtx(new Map([[goodState.state, goodState]]));
    await expect(
      completeOAuthFlow(ctx, {
        state: goodState.state,
        code: 'c',
        redirectUri: 'https://attacker.test/cb',
      }),
    ).rejects.toBeInstanceOf(OAuthStateError);
  });

  it('surfaces provider token errors', async () => {
    const ctx = makeCtx(new Map([[goodState.state, goodState]]));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"bad_code"}', { status: 400 }),
    );
    await expect(
      completeOAuthFlow(ctx, {
        state: goodState.state,
        code: 'bad',
        redirectUri: goodState.redirectUri,
      }),
    ).rejects.toBeInstanceOf(OAuthTokenError);
  });
});
