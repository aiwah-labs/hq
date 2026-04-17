import { db } from '@hq/db';
import type { AuthenticatedIdentity, UpsertOptions, UpsertResult } from './types.js';

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

function resolveRole(identity: AuthenticatedIdentity, opts: UpsertOptions): 'ADMIN' | 'MEMBER' {
  const email = identity.email.toLowerCase();
  const adminEmails = (opts.adminEmails ?? []).map((e) => e.toLowerCase());
  if (adminEmails.includes(email)) return 'ADMIN';
  const adminGroups = new Set(opts.adminGroups ?? []);
  if (identity.groups?.some((g) => adminGroups.has(g))) return 'ADMIN';
  return opts.defaultRole;
}

function isDomainAllowed(identity: AuthenticatedIdentity, opts: UpsertOptions): boolean {
  if (!opts.allowedDomains || opts.allowedDomains.length === 0) return true;
  return opts.allowedDomains.map((d) => d.toLowerCase()).includes(emailDomain(identity.email));
}

/**
 * Resolve an `AuthenticatedIdentity` into an HQ `User`.
 *
 * Behavior:
 * - If an `IdentityAccount` for (provider, providerId, subject) exists, its User is used.
 * - Else if a User with a matching email exists, an IdentityAccount is linked.
 * - Else (and only if auto-provision is enabled and domain is allowed), a new User + IdentityAccount is created.
 * - Inactive/deleted users are denied.
 */
export async function upsertUserFromIdentity(
  identity: AuthenticatedIdentity,
  opts: UpsertOptions,
): Promise<UpsertResult> {
  // 1. Existing identity → user
  const existing = await db.identityAccount.findFirst({
    where: {
      provider: identity.providerType === 'local' ? 'LOCAL' : identity.providerType === 'oidc' ? 'OIDC' : 'SAML',
      providerId: identity.providerId,
      subject: identity.subject,
    },
    include: { user: true },
  });

  if (existing) {
    if (existing.user.status !== 'ACTIVE' || existing.user.deletedAt) {
      return { kind: 'denied', reason: 'inactive' };
    }
    // Refresh the raw profile + email on every sign-in.
    await db.identityAccount.update({
      where: { id: existing.id },
      data: {
        email: identity.email,
        rawProfile: identity.rawProfile ?? null,
      },
    });
    return { kind: 'ok', userId: existing.userId, created: false };
  }

  // 2. Email match → link identity to existing user
  const byEmail = await db.user.findUnique({ where: { email: identity.email } });
  if (byEmail) {
    if (byEmail.status !== 'ACTIVE' || byEmail.deletedAt) {
      return { kind: 'denied', reason: 'inactive' };
    }
    if (identity.providerType !== 'local') {
      await db.identityAccount.create({
        data: {
          userId: byEmail.id,
          provider: identity.providerType === 'oidc' ? 'OIDC' : 'SAML',
          providerId: identity.providerId,
          subject: identity.subject,
          email: identity.email,
          rawProfile: identity.rawProfile ?? null,
        },
      });
    }
    return { kind: 'ok', userId: byEmail.id, created: false };
  }

  // 3. No match — auto-provision if allowed
  if (!opts.allowAutoProvision) {
    return { kind: 'denied', reason: 'no_auto_provision' };
  }
  if (!isDomainAllowed(identity, opts)) {
    return { kind: 'denied', reason: 'domain' };
  }

  const role = resolveRole(identity, opts);
  const user = await db.user.create({
    data: {
      email: identity.email,
      name: identity.name ?? null,
      role,
      status: 'ACTIVE',
      // SSO-only users have no local password.
      passwordHash: null,
    },
  });

  if (identity.providerType !== 'local') {
    await db.identityAccount.create({
      data: {
        userId: user.id,
        provider: identity.providerType === 'oidc' ? 'OIDC' : 'SAML',
        providerId: identity.providerId,
        subject: identity.subject,
        email: identity.email,
        rawProfile: identity.rawProfile ?? null,
      },
    });
  }

  return { kind: 'ok', userId: user.id, created: true };
}
