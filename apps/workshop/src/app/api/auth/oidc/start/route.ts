import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { buildAuthorizationRequest, readOidcEnv } from '@hq/auth/providers';

/**
 * Start the OIDC Authorization Code flow.
 *
 * Persists the CSRF `state` and ID-token `nonce` as short-lived httpOnly cookies;
 * the callback validates them before exchanging the code.
 */
export async function GET() {
  const env = readOidcEnv();
  if (!env.enabled || !env.issuerUrl || !env.clientId || !env.clientSecret || !env.redirectUri) {
    return NextResponse.json({ error: 'oidc_disabled' }, { status: 404 });
  }

  const randomBytesHex = (n: number) => crypto.randomBytes(n).toString('hex');

  let authReq;
  try {
    authReq = await buildAuthorizationRequest(env, randomBytesHex);
  } catch (err) {
    return NextResponse.json(
      { error: 'oidc_discovery_failed', message: (err as Error).message },
      { status: 500 },
    );
  }

  const cookieStore = await cookies();
  const commonOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60, // 10 minutes — plenty for the IdP round-trip
  };
  cookieStore.set('oidc_state', authReq.state, commonOpts);
  cookieStore.set('oidc_nonce', authReq.nonce, commonOpts);

  return NextResponse.redirect(authReq.url);
}
