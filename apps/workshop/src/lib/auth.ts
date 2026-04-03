// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveAuth } from '@hq/auth/middleware';
import { hasPermission } from '@hq/auth/policy';
import { assertUserPrincipal } from '@hq/auth/principals';
import type { PermissionKey, UserPrincipal } from '@hq/auth/types';

export async function getAuthContext() {
  const requestHeaders = await headers();

  return resolveAuth({
    cookieHeader: requestHeaders.get('cookie'),
    authorizationHeader: requestHeaders.get('authorization'),
  });
}

export async function getCurrentUser(): Promise<UserPrincipal | null> {
  const context = await getAuthContext();
  if (context.kind !== 'authenticated') {
    return null;
  }

  try {
    return assertUserPrincipal(context.principal);
  } catch {
    return null;
  }
}

export async function requireAuth(): Promise<UserPrincipal> {
  const current = await getCurrentUser();

  if (!current) {
    redirect('/login');
  }

  return current;
}

export function can(principal: UserPrincipal, permission: PermissionKey): boolean {
  return hasPermission(principal, permission);
}

export async function requirePermission(permission: PermissionKey): Promise<UserPrincipal> {
  const principal = await requireAuth();

  if (!can(principal, permission)) {
    redirect('/forbidden');
  }

  return principal;
}
