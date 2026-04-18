/**
 * Generic OAuth 2.0 authorization-code runner (with PKCE).
 *
 * The framework handles:
 *   - Generating state + PKCE verifier/challenge
 *   - Building the authorize URL
 *   - Exchanging the code for tokens
 *   - Optionally fetching userinfo and storing it as connection metadata
 *   - Saving an encrypted `IntegrationConnection` row
 *
 * Providers just declare `auth: { kind: 'oauth', ... }` in their
 * `IntegrationDefinition`. The state is kept in the DB as a short-lived
 * `OAuthState` row keyed by an opaque token that we put in the `state`
 * query param.
 *
 * Refresh-token rotation is handled by `refreshOAuthToken` — callers
 * (usually `resolveConnection`) invoke it lazily when they detect an
 * expired access token.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { ServiceContext } from '@hq/services';
import { getIntegration } from './registry.js';
import { encryptCredentials, decryptCredentials } from './encrypt.js';
import type { OAuthAuth, OAuthCredentials } from './types.js';

const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class OAuthStateError extends Error {
  code = 'OAUTH_STATE_INVALID';
}

export class OAuthTokenError extends Error {
  code = 'OAUTH_TOKEN_ERROR';
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
  }
}

export interface OAuthStartInput {
  integrationKey: string;
  /** Absolute URL the provider will redirect to after authorization. */
  redirectUri: string;
  /** Optional label to apply to the connection once completed. */
  label?: string;
}

export interface OAuthStartResult {
  /** Full URL the browser should be redirected to. */
  authorizeUrl: string;
  /** Opaque state token also embedded in the URL (returned so callers can log). */
  state: string;
}

export interface OAuthCompleteInput {
  /** Value from the provider's `state` query param. */
  state: string;
  /** Value from the provider's `code` query param. */
  code: string;
  /** Must match the `redirectUri` used during `startOAuthFlow`. */
  redirectUri: string;
}

/**
 * Begin an OAuth flow. Persists a state row and returns the URL the user
 * should be redirected to.
 */
export async function startOAuthFlow(
  ctx: ServiceContext,
  input: OAuthStartInput,
): Promise<OAuthStartResult> {
  const def = getIntegration(input.integrationKey);
  if (!def) throw new Error(`Unknown integration "${input.integrationKey}".`);
  if (def.auth.kind !== 'oauth') {
    throw new Error(`Integration "${def.key}" does not use OAuth.`);
  }
  if (ctx.actor.kind !== 'user') {
    throw new Error('OAuth flows require an authenticated user.');
  }

  const clientId = process.env[def.auth.clientIdEnv];
  if (!clientId) {
    throw new Error(
      `Missing OAuth client_id: set ${def.auth.clientIdEnv} to enable the "${def.key}" integration.`,
    );
  }

  const state = randomBytes(24).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  await ctx.dbClient.oAuthState.create({
    data: {
      state,
      integrationKey: def.key,
      userId: ctx.actor.userId,
      codeVerifier,
      redirectUri: input.redirectUri,
      label: input.label ?? def.name,
      expiresAt: new Date(ctx.now().getTime() + STATE_TTL_MS),
    },
  });

  const url = new URL(def.auth.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', def.auth.scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return { authorizeUrl: url.toString(), state };
}

/**
 * Complete an OAuth flow. Exchanges the code for tokens, fetches userinfo
 * if the definition requests it, and writes an encrypted connection row.
 */
export async function completeOAuthFlow(
  ctx: ServiceContext,
  input: OAuthCompleteInput,
): Promise<{ connectionId: string; integrationKey: string }> {
  const row = await ctx.dbClient.oAuthState.findUnique({ where: { state: input.state } });
  if (!row) throw new OAuthStateError('OAuth state not found — the flow may have expired.');
  if (row.expiresAt.getTime() < ctx.now().getTime()) {
    await ctx.dbClient.oAuthState.delete({ where: { state: input.state } }).catch(() => {});
    throw new OAuthStateError('OAuth state expired. Please restart the connect flow.');
  }
  if (row.redirectUri !== input.redirectUri) {
    throw new OAuthStateError('OAuth redirect_uri mismatch.');
  }

  const def = getIntegration(row.integrationKey);
  if (!def || def.auth.kind !== 'oauth') {
    throw new OAuthStateError(`Integration "${row.integrationKey}" is not registered or not OAuth.`);
  }

  const tokenResponse = await exchangeCodeForToken(def.auth, {
    code: input.code,
    redirectUri: input.redirectUri,
    codeVerifier: row.codeVerifier,
  });

  const credentials: OAuthCredentials = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    tokenType: tokenResponse.token_type,
    scope: tokenResponse.scope,
    expiresAt:
      typeof tokenResponse.expires_in === 'number'
        ? ctx.now().getTime() + tokenResponse.expires_in * 1000
        : undefined,
  };

  let metadata: unknown = null;
  if (def.auth.userInfoUrl) {
    metadata = await fetchUserInfo(def.auth.userInfoUrl, credentials.accessToken).catch(
      () => null,
    );
  }

  const encrypted = encryptCredentials(credentials);
  const scopeEnum = def.scope === 'org' ? 'ORG' : 'USER';
  const ownerUserId = def.scope === 'user' ? row.userId : null;

  const connection = await ctx.dbClient.integrationConnection.create({
    data: {
      integrationKey: def.key,
      label: row.label,
      scope: scopeEnum,
      userId: ownerUserId,
      credentials: encrypted,
      metadata: (metadata ?? undefined) as never,
      allowedUserIds: [],
      allowedRoles: [],
      createdByUserId: row.userId,
    },
  });

  await ctx.dbClient.oAuthState.delete({ where: { state: input.state } }).catch(() => {});

  return { connectionId: connection.id, integrationKey: def.key };
}

/**
 * Refresh the access token for an OAuth connection. No-op if the provider
 * didn't issue a refresh_token. Caller decides when to invoke this — usually
 * right before using the connection when `expiresAt` is near.
 */
export async function refreshOAuthToken(
  ctx: ServiceContext,
  connectionId: string,
): Promise<void> {
  const row = await ctx.dbClient.integrationConnection.findUnique({ where: { id: connectionId } });
  if (!row) return;
  const def = getIntegration(row.integrationKey);
  if (!def || def.auth.kind !== 'oauth') return;

  const creds = decryptCredentials<OAuthCredentials>(row.credentials);
  if (!creds.refreshToken) return;

  const res = await postTokenRequest(def.auth, {
    grant_type: 'refresh_token',
    refresh_token: creds.refreshToken,
  });

  const next: OAuthCredentials = {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? creds.refreshToken,
    tokenType: res.token_type ?? creds.tokenType,
    scope: res.scope ?? creds.scope,
    expiresAt:
      typeof res.expires_in === 'number' ? ctx.now().getTime() + res.expires_in * 1000 : undefined,
  };

  await ctx.dbClient.integrationConnection.update({
    where: { id: connectionId },
    data: { credentials: encryptCredentials(next), status: 'ACTIVE', lastError: null },
  });
}

// ─── HTTP plumbing ───────────────────────────────────────────────────────────

interface TokenResponseBody {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

async function exchangeCodeForToken(
  auth: OAuthAuth,
  params: { code: string; redirectUri: string; codeVerifier: string },
): Promise<TokenResponseBody> {
  return postTokenRequest(auth, {
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
}

async function postTokenRequest(
  auth: OAuthAuth,
  fields: Record<string, string>,
): Promise<TokenResponseBody> {
  const clientId = process.env[auth.clientIdEnv];
  const clientSecret = process.env[auth.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new OAuthTokenError(
      `Missing OAuth credentials: ${auth.clientIdEnv}/${auth.clientSecretEnv} must be set.`,
    );
  }

  const body = new URLSearchParams(fields);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  if (auth.tokenAuthStyle === 'header' || auth.tokenAuthStyle === undefined) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }

  const res = await fetch(auth.tokenUrl, { method: 'POST', headers, body });
  const text = await res.text();
  if (!res.ok) {
    throw new OAuthTokenError(`OAuth token request failed (${res.status})`, res.status, text);
  }
  try {
    const parsed = JSON.parse(text) as TokenResponseBody;
    if (!parsed.access_token) {
      throw new OAuthTokenError('OAuth token response missing access_token.', res.status, parsed);
    }
    return parsed;
  } catch (err) {
    if (err instanceof OAuthTokenError) throw err;
    throw new OAuthTokenError('OAuth token response was not JSON.', res.status, text);
  }
}

async function fetchUserInfo(url: string, accessToken: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`userInfo fetch failed (${res.status})`);
  return res.json();
}
