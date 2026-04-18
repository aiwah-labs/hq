import type { AuthProvider, AuthenticatedIdentity } from './types.js';

/**
 * Generic OIDC Authorization Code flow (no external dependency).
 *
 * HQ's OIDC starter works with any spec-compliant IdP: Google Workspace,
 * Okta, Azure AD / Entra ID, Authentik, Keycloak, Auth0, …
 *
 * This module does the raw HTTP work (discovery, token exchange, userinfo).
 * Apps wire the start/callback routes — see `docs/sso.md` for a reference
 * implementation.
 */

export interface OidcEnv {
  enabled: boolean;
  issuerUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  allowedDomains: string[];
  adminEmails: string[];
  adminGroups: string[];
  roleClaim: string;
  autoProvision: boolean;
  defaultRole: 'ADMIN' | 'MEMBER';
  label: string;
  scopes: string;
}

export function readOidcEnv(env: NodeJS.ProcessEnv = process.env): OidcEnv {
  const parseCsv = (v: string | undefined): string[] =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    enabled: env.AUTH_OIDC_ENABLED === 'true',
    issuerUrl: env.AUTH_OIDC_ISSUER_URL ?? null,
    clientId: env.AUTH_OIDC_CLIENT_ID ?? null,
    clientSecret: env.AUTH_OIDC_CLIENT_SECRET ?? null,
    redirectUri: env.AUTH_OIDC_REDIRECT_URI ?? null,
    allowedDomains: parseCsv(env.AUTH_OIDC_ALLOWED_DOMAINS),
    adminEmails: parseCsv(env.AUTH_ADMIN_EMAILS),
    adminGroups: parseCsv(env.AUTH_ADMIN_GROUPS),
    roleClaim: env.AUTH_OIDC_ROLE_CLAIM ?? 'groups',
    autoProvision: env.AUTH_AUTO_PROVISION !== 'false',
    defaultRole: (env.AUTH_DEFAULT_ROLE as 'ADMIN' | 'MEMBER') ?? 'MEMBER',
    label: env.AUTH_OIDC_LABEL ?? 'Continue with SSO',
    scopes: env.AUTH_OIDC_SCOPES ?? 'openid email profile',
  };
}

export function describeOidcProvider(config: OidcEnv): AuthProvider {
  return {
    id: 'oidc',
    type: 'oidc',
    enabled: config.enabled && !!config.issuerUrl && !!config.clientId && !!config.clientSecret,
    label: config.label,
  };
}

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

let cachedDiscovery: { issuer: string; data: OidcDiscovery; fetchedAt: number } | null = null;
const DISCOVERY_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function discover(issuerUrl: string): Promise<OidcDiscovery> {
  if (
    cachedDiscovery &&
    cachedDiscovery.issuer === issuerUrl &&
    Date.now() - cachedDiscovery.fetchedAt < DISCOVERY_TTL_MS
  ) {
    return cachedDiscovery.data;
  }
  const url = issuerUrl.replace(/\/$/, '') + '/.well-known/openid-configuration';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OIDC discovery failed (${res.status}) for ${url}`);
  }
  const data = (await res.json()) as OidcDiscovery;
  cachedDiscovery = { issuer: issuerUrl, data, fetchedAt: Date.now() };
  return data;
}

export interface AuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
}

/** Build the authorization URL + state/nonce. Caller must persist state/nonce to validate the callback. */
export async function buildAuthorizationRequest(
  config: OidcEnv,
  randomBytesHex: (n: number) => string,
): Promise<AuthorizationRequest> {
  if (!config.issuerUrl || !config.clientId || !config.redirectUri) {
    throw new Error('OIDC is not fully configured.');
  }
  const disc = await discover(config.issuerUrl);
  const state = randomBytesHex(16);
  const nonce = randomBytesHex(16);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes,
    state,
    nonce,
  });

  return {
    url: `${disc.authorization_endpoint}?${params.toString()}`,
    state,
    nonce,
  };
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
}

/** Exchange the authorization code for tokens. */
export async function exchangeCode(config: OidcEnv, code: string): Promise<TokenResponse> {
  if (!config.issuerUrl || !config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error('OIDC is not fully configured.');
  }
  const disc = await discover(config.issuerUrl);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const res = await fetch(disc.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OIDC token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Decode the ID token without verifying the signature. Adequate for local dev and
 * as a fallback; production deployments SHOULD use a JWKS verifier. Signature
 * verification is documented as an env-driven addition in `docs/sso.md` to
 * keep the template dependency-free.
 */
export function decodeIdToken(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid ID token');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payload) as Record<string, unknown>;
}

export async function fetchUserInfo(config: OidcEnv, accessToken: string): Promise<Record<string, unknown>> {
  if (!config.issuerUrl) throw new Error('OIDC is not fully configured.');
  const disc = await discover(config.issuerUrl);
  const res = await fetch(disc.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`OIDC userinfo failed (${res.status})`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Project the OIDC claims into an `AuthenticatedIdentity`. */
export function identityFromClaims(config: OidcEnv, claims: Record<string, unknown>): AuthenticatedIdentity {
  const email = typeof claims.email === 'string' ? claims.email : '';
  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  if (!email || !sub) {
    throw new Error('OIDC claims missing email or sub.');
  }

  const groupsRaw = claims[config.roleClaim];
  const groups = Array.isArray(groupsRaw)
    ? groupsRaw.filter((g): g is string => typeof g === 'string')
    : undefined;

  return {
    providerId: 'oidc',
    providerType: 'oidc',
    subject: sub,
    email,
    name: typeof claims.name === 'string' ? claims.name : null,
    rawProfile: claims,
    groups,
  };
}
