import { cookies, headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import {
  decodeIdToken,
  exchangeCode,
  fetchUserInfo,
  identityFromClaims,
  readOidcEnv,
  upsertUserFromIdentity,
} from '@hq/auth/providers';
import { createSession } from '@hq/auth/sessions';
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from '@hq/auth/cookies';

/**
 * OIDC Authorization Code callback.
 *
 * 1. Validate state cookie matches the `state` param (CSRF).
 * 2. Exchange the auth code for tokens.
 * 3. Validate the ID token nonce.
 * 4. Merge ID token + UserInfo claims into an `AuthenticatedIdentity`.
 * 5. Upsert into the canonical `User` table.
 * 6. Mint an HQ session and drop the cookie.
 *
 * Signature verification is intentionally out of scope for the template —
 * swap in a JWKS verifier in production (see `docs/sso.md`).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return redirectToLogin(request, `SSO error: ${errorParam}`);
  }
  if (!code || !stateParam) {
    return redirectToLogin(request, 'SSO callback missing code or state.');
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('oidc_state')?.value;
  const expectedNonce = cookieStore.get('oidc_nonce')?.value;
  cookieStore.delete('oidc_state');
  cookieStore.delete('oidc_nonce');

  if (!expectedState || expectedState !== stateParam) {
    return redirectToLogin(request, 'SSO state mismatch. Please try again.');
  }

  const env = readOidcEnv();
  if (!env.enabled) {
    return NextResponse.json({ error: 'oidc_disabled' }, { status: 404 });
  }

  let tokens;
  try {
    tokens = await exchangeCode(env, code);
  } catch (err) {
    return redirectToLogin(request, `SSO token exchange failed: ${(err as Error).message}`);
  }

  // Decode ID token (template: unverified; see docs/sso.md for JWKS verification).
  let idClaims: Record<string, unknown> = {};
  try {
    idClaims = decodeIdToken(tokens.id_token);
  } catch (err) {
    return redirectToLogin(request, `Invalid ID token: ${(err as Error).message}`);
  }

  if (expectedNonce && idClaims.nonce && idClaims.nonce !== expectedNonce) {
    return redirectToLogin(request, 'SSO nonce mismatch.');
  }

  // Enrich with UserInfo — some IdPs put groups only on /userinfo.
  let userInfo: Record<string, unknown> = {};
  try {
    userInfo = await fetchUserInfo(env, tokens.access_token);
  } catch {
    // UserInfo is optional — ID token claims alone are often enough.
    userInfo = {};
  }

  const merged = { ...idClaims, ...userInfo };

  let identity;
  try {
    identity = identityFromClaims(env, merged);
    identity.providerId = resolveProviderId(env.issuerUrl);
  } catch (err) {
    return redirectToLogin(request, `SSO claims invalid: ${(err as Error).message}`);
  }

  const upsert = await upsertUserFromIdentity(identity, {
    allowAutoProvision: env.autoProvision,
    defaultRole: env.defaultRole,
    adminEmails: env.adminEmails,
    adminGroups: env.adminGroups,
    allowedDomains: env.allowedDomains,
  });

  if (upsert.kind === 'denied') {
    const reason =
      upsert.reason === 'domain'
        ? 'Your email domain is not allowed.'
        : upsert.reason === 'no_auto_provision'
        ? 'This account has not been provisioned. Ask an admin to invite you.'
        : 'Your account is inactive.';
    return redirectToLogin(request, reason);
  }

  // Mint an HQ session.
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() ?? null;
  const userAgent = requestHeaders.get('user-agent');

  const token = await createSession(upsert.userId, { ipAddress, userAgent });
  cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  return NextResponse.redirect(new URL('/workshop', request.url));
}

function redirectToLogin(request: NextRequest, message: string): NextResponse {
  const encoded = encodeURIComponent(message);
  return NextResponse.redirect(new URL(`/login?error=${encoded}`, request.url));
}

/** Turn an issuer URL into a stable provider id (`google`, `okta`, …). */
function resolveProviderId(issuerUrl: string | null): string {
  if (!issuerUrl) return 'oidc';
  try {
    const host = new URL(issuerUrl).hostname.toLowerCase();
    if (host.endsWith('google.com') || host.endsWith('accounts.google.com')) return 'google';
    if (host.endsWith('okta.com')) return 'okta';
    if (host.endsWith('microsoftonline.com') || host.endsWith('login.microsoft.com')) return 'azure-ad';
    if (host.includes('auth0.com')) return 'auth0';
    if (host.includes('authentik')) return 'authentik';
    if (host.includes('keycloak')) return 'keycloak';
    return host;
  } catch {
    return 'oidc';
  }
}
