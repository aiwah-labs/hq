import { describe, it, expect } from 'vitest';
import {
  readOidcEnv,
  describeOidcProvider,
  decodeIdToken,
  identityFromClaims,
  buildAuthorizationRequest,
  type OidcEnv,
} from '../providers/oidc.js';

// ── readOidcEnv ───────────────────────────────────────────────────────────────

describe('readOidcEnv', () => {
  it('defaults to disabled with sensible blanks', () => {
    const env = readOidcEnv({});
    expect(env.enabled).toBe(false);
    expect(env.issuerUrl).toBe(null);
    expect(env.clientId).toBe(null);
    expect(env.clientSecret).toBe(null);
    expect(env.redirectUri).toBe(null);
    expect(env.allowedDomains).toEqual([]);
    expect(env.adminEmails).toEqual([]);
    expect(env.adminGroups).toEqual([]);
    expect(env.roleClaim).toBe('groups');
    expect(env.autoProvision).toBe(true);
    expect(env.defaultRole).toBe('MEMBER');
    expect(env.label).toBe('Continue with SSO');
    expect(env.scopes).toBe('openid email profile');
  });

  it('parses all recognized env vars', () => {
    const env = readOidcEnv({
      AUTH_OIDC_ENABLED: 'true',
      AUTH_OIDC_ISSUER_URL: 'https://accounts.google.com',
      AUTH_OIDC_CLIENT_ID: 'client',
      AUTH_OIDC_CLIENT_SECRET: 'secret',
      AUTH_OIDC_REDIRECT_URI: 'https://app.example.com/callback',
      AUTH_OIDC_ALLOWED_DOMAINS: 'example.com, partner.com ,',
      AUTH_ADMIN_EMAILS: 'root@example.com,ops@example.com',
      AUTH_ADMIN_GROUPS: 'hq-admins',
      AUTH_OIDC_ROLE_CLAIM: 'roles',
      AUTH_AUTO_PROVISION: 'false',
      AUTH_DEFAULT_ROLE: 'ADMIN',
      AUTH_OIDC_LABEL: 'Continue with Google',
      AUTH_OIDC_SCOPES: 'openid email',
    });

    expect(env.enabled).toBe(true);
    expect(env.issuerUrl).toBe('https://accounts.google.com');
    expect(env.allowedDomains).toEqual(['example.com', 'partner.com']);
    expect(env.adminEmails).toEqual(['root@example.com', 'ops@example.com']);
    expect(env.adminGroups).toEqual(['hq-admins']);
    expect(env.roleClaim).toBe('roles');
    expect(env.autoProvision).toBe(false);
    expect(env.defaultRole).toBe('ADMIN');
    expect(env.label).toBe('Continue with Google');
    expect(env.scopes).toBe('openid email');
  });

  it('treats any non-"true" value as disabled', () => {
    expect(readOidcEnv({ AUTH_OIDC_ENABLED: '1' }).enabled).toBe(false);
    expect(readOidcEnv({ AUTH_OIDC_ENABLED: 'yes' }).enabled).toBe(false);
    expect(readOidcEnv({ AUTH_OIDC_ENABLED: undefined }).enabled).toBe(false);
  });
});

// ── describeOidcProvider ──────────────────────────────────────────────────────

describe('describeOidcProvider', () => {
  const fullConfig: OidcEnv = {
    enabled: true,
    issuerUrl: 'https://accounts.google.com',
    clientId: 'id',
    clientSecret: 'secret',
    redirectUri: 'https://a/cb',
    allowedDomains: [],
    adminEmails: [],
    adminGroups: [],
    roleClaim: 'groups',
    autoProvision: true,
    defaultRole: 'MEMBER',
    label: 'Continue with Google',
    scopes: 'openid email profile',
  };

  it('surfaces enabled=true only when fully configured', () => {
    const p = describeOidcProvider(fullConfig);
    expect(p.id).toBe('oidc');
    expect(p.type).toBe('oidc');
    expect(p.enabled).toBe(true);
    expect(p.label).toBe('Continue with Google');
  });

  it('enabled=false when env says so', () => {
    expect(describeOidcProvider({ ...fullConfig, enabled: false }).enabled).toBe(false);
  });

  it('enabled=false when missing issuer/client', () => {
    expect(describeOidcProvider({ ...fullConfig, issuerUrl: null }).enabled).toBe(false);
    expect(describeOidcProvider({ ...fullConfig, clientId: null }).enabled).toBe(false);
    expect(describeOidcProvider({ ...fullConfig, clientSecret: null }).enabled).toBe(false);
  });
});

// ── decodeIdToken ─────────────────────────────────────────────────────────────

describe('decodeIdToken', () => {
  it('decodes the payload of a valid JWT', () => {
    const payload = { sub: 'abc', email: 'user@example.com' };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `header.${encoded}.signature`;
    expect(decodeIdToken(token)).toEqual(payload);
  });

  it('throws on malformed JWT', () => {
    expect(() => decodeIdToken('not-a-jwt')).toThrow('Invalid ID token');
    expect(() => decodeIdToken('a.b')).toThrow('Invalid ID token');
  });
});

// ── identityFromClaims ────────────────────────────────────────────────────────

describe('identityFromClaims', () => {
  const cfg: OidcEnv = {
    enabled: true,
    issuerUrl: 'https://x',
    clientId: 'c',
    clientSecret: 's',
    redirectUri: 'https://a/cb',
    allowedDomains: [],
    adminEmails: [],
    adminGroups: [],
    roleClaim: 'groups',
    autoProvision: true,
    defaultRole: 'MEMBER',
    label: 'x',
    scopes: 'openid email',
  };

  it('projects standard OIDC claims', () => {
    const identity = identityFromClaims(cfg, {
      sub: 'google|123',
      email: 'user@example.com',
      name: 'User',
      groups: ['hq-members', 'hq-admins'],
    });
    expect(identity.providerId).toBe('oidc');
    expect(identity.providerType).toBe('oidc');
    expect(identity.subject).toBe('google|123');
    expect(identity.email).toBe('user@example.com');
    expect(identity.name).toBe('User');
    expect(identity.groups).toEqual(['hq-members', 'hq-admins']);
  });

  it('honors a custom role claim', () => {
    const identity = identityFromClaims(
      { ...cfg, roleClaim: 'https://hq.example/groups' },
      {
        sub: 'x', email: 'u@e.com',
        'https://hq.example/groups': ['admins'],
      },
    );
    expect(identity.groups).toEqual(['admins']);
  });

  it('filters non-string group entries', () => {
    const identity = identityFromClaims(cfg, {
      sub: 'x', email: 'u@e.com',
      groups: ['ok', 42, null, 'also-ok'],
    });
    expect(identity.groups).toEqual(['ok', 'also-ok']);
  });

  it('sets groups=undefined when the claim is not an array', () => {
    const identity = identityFromClaims(cfg, { sub: 'x', email: 'u@e.com', groups: 'single' });
    expect(identity.groups).toBeUndefined();
  });

  it('throws when email or sub is missing', () => {
    expect(() => identityFromClaims(cfg, { sub: 'x' })).toThrow('email or sub');
    expect(() => identityFromClaims(cfg, { email: 'x@e.com' })).toThrow('email or sub');
  });
});

// ── buildAuthorizationRequest ─────────────────────────────────────────────────

describe('buildAuthorizationRequest', () => {
  const originalFetch = globalThis.fetch;

  it('builds a well-formed authorization URL', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          issuer: 'https://idp.example',
          authorization_endpoint: 'https://idp.example/auth',
          token_endpoint: 'https://idp.example/token',
          userinfo_endpoint: 'https://idp.example/userinfo',
          jwks_uri: 'https://idp.example/jwks',
        }),
        { status: 200 },
      )) as unknown as typeof globalThis.fetch;

    const cfg: OidcEnv = {
      enabled: true,
      // Use a URL not already cached by earlier tests to force a fetch.
      issuerUrl: 'https://idp.example',
      clientId: 'client-abc',
      clientSecret: 'secret',
      redirectUri: 'https://app.example.com/callback',
      allowedDomains: [],
      adminEmails: [],
      adminGroups: [],
      roleClaim: 'groups',
      autoProvision: true,
      defaultRole: 'MEMBER',
      label: 'Continue with SSO',
      scopes: 'openid email profile',
    };

    let n = 0;
    const authReq = await buildAuthorizationRequest(cfg, (bytes) =>
      `rand${n++}`.repeat(bytes).slice(0, bytes * 2),
    );

    expect(authReq.url.startsWith('https://idp.example/auth?')).toBe(true);
    expect(authReq.url).toContain('response_type=code');
    expect(authReq.url).toContain('client_id=client-abc');
    expect(authReq.url).toContain('scope=openid+email+profile');
    expect(authReq.state).toBeTruthy();
    expect(authReq.nonce).toBeTruthy();
    expect(authReq.state).not.toBe(authReq.nonce);

    globalThis.fetch = originalFetch;
  });

  it('throws when config is incomplete', async () => {
    const bad = {
      enabled: false,
      issuerUrl: null,
      clientId: null,
      clientSecret: null,
      redirectUri: null,
      allowedDomains: [],
      adminEmails: [],
      adminGroups: [],
      roleClaim: 'groups',
      autoProvision: true,
      defaultRole: 'MEMBER',
      label: 'x',
      scopes: 'openid email',
    } satisfies OidcEnv;
    await expect(buildAuthorizationRequest(bad, (n) => 'x'.repeat(n))).rejects.toThrow('not fully configured');
  });
});
