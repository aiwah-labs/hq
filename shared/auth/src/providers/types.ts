/**
 * Auth provider abstraction. Every entry-point into the system (local password
 * login, OIDC callback, future SAML) produces an `AuthenticatedIdentity`, which
 * `upsertUserFromIdentity` resolves into a canonical `User` row.
 *
 * > SSO proves who someone is. HQ decides what they can do.
 */

export type IdentityProviderType = 'local' | 'oidc' | 'saml';

export interface AuthProvider {
  /** Stable identifier, e.g. `local`, `google`, `okta`. */
  id: string;
  type: IdentityProviderType;
  /** Whether this provider is available for login right now. */
  enabled: boolean;
  /** Human-readable label for UI ("Continue with Google"). */
  label: string;
}

/** Minimal config required to spin up a provider. */
export interface AuthProviderConfig {
  id: string;
  type: IdentityProviderType;
  enabled: boolean;
  label?: string;
  [key: string]: unknown;
}

/** The result of a successful authentication from any provider. */
export interface AuthenticatedIdentity {
  /** Which provider produced this identity. */
  providerId: string;
  providerType: IdentityProviderType;
  /** Stable external subject (OIDC `sub`, SAML NameID, or `local:<userId>`). */
  subject: string;
  email: string;
  name?: string | null;
  /** Raw claims / profile for audit + role mapping. */
  rawProfile?: Record<string, unknown>;
  /** Groups asserted by the IdP — used by the role-mapping step. */
  groups?: string[];
}

/** Options controlling how an identity maps to an HQ user. */
export interface UpsertOptions {
  /** If the provider is `local`, we never create an IdentityAccount row. */
  allowAutoProvision: boolean;
  /** Role assigned when a new user is auto-provisioned. */
  defaultRole: 'ADMIN' | 'MEMBER';
  /** Admin emails (env-driven); forces ADMIN regardless of provider claims. */
  adminEmails?: string[];
  /** Admin group names; if present in `identity.groups`, user becomes ADMIN. */
  adminGroups?: string[];
  /** Email domains that are allowed to auto-provision. Empty = deny all. */
  allowedDomains?: string[];
}

/** Outcome of a user resolution attempt. */
export type UpsertResult =
  | { kind: 'ok'; userId: string; created: boolean }
  | { kind: 'denied'; reason: 'domain' | 'no_auto_provision' | 'inactive' };
