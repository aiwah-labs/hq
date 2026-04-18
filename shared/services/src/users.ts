import { db } from '@hq/db';

/**
 * User read helpers. `@hq/services` exposes a thin read API over the canonical
 * `User` row and the linked `IdentityAccount` rows so Workshop can render the
 * right provider badges without reaching into Prisma directly.
 */

export async function getUserById(id: string) {
  return db.user.findUnique({
    where: { id },
    include: { identities: true },
  });
}

export async function listUsers() {
  return db.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { identities: true },
  });
}

/**
 * Summary of a user's auth providers — local (password) plus any external
 * identities. Consumed by the users table in Workshop.
 */
export interface UserAuthSummary {
  hasLocalPassword: boolean;
  /** One entry per linked IdentityAccount. */
  externalProviders: Array<{
    provider: 'LOCAL' | 'OIDC' | 'SAML';
    providerId: string;
    subject: string;
    email: string | null;
  }>;
  /** Friendly label: `Local`, `SSO: google`, `SSO: okta`, … */
  primaryLabel: string;
}

export function summarizeUserAuth(user: {
  passwordHash: string | null;
  identities?: Array<{ provider: 'LOCAL' | 'OIDC' | 'SAML'; providerId: string; subject: string; email: string | null }>;
}): UserAuthSummary {
  const hasLocalPassword = user.passwordHash != null;
  const identities = user.identities ?? [];
  const externalProviders = identities
    .filter((i) => i.provider !== 'LOCAL')
    .map((i) => ({
      provider: i.provider,
      providerId: i.providerId,
      subject: i.subject,
      email: i.email,
    }));

  let primaryLabel: string;
  if (externalProviders.length > 0) {
    primaryLabel = `SSO: ${externalProviders[0].providerId}`;
  } else if (hasLocalPassword) {
    primaryLabel = 'Local';
  } else {
    primaryLabel = 'No credential';
  }

  return { hasLocalPassword, externalProviders, primaryLabel };
}
