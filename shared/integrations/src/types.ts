/**
 * Integration framework types.
 *
 * An `IntegrationDefinition` is declared in code (committed to the repo) and
 * describes the shape of a third-party service the platform can talk to.
 * At runtime, admins or users create `IntegrationConnection` rows (stored in
 * the DB) that hold actual credentials for a specific account.
 *
 * Design invariants:
 *   - `scope` and `multiplicity` are properties of the DEFINITION, not the
 *     connection. Shopify is always org-scoped; GitHub is always user-scoped.
 *   - Action handlers never see env vars or raw credentials. They call
 *     `ctx.getConnection(key, opts)` and receive a resolved, decrypted,
 *     permission-checked connection.
 *   - Per-connection ACL (allowedUserIds / allowedRoles) is optional. An
 *     empty ACL falls back to the role-gated permission check.
 */

/** Where the credentials live. */
export type IntegrationScope = 'org' | 'user';

/** How many concurrent connections make sense. */
export type IntegrationMultiplicity = 'single' | 'multiple';

/** A single field in a static-credential form. */
export interface CredentialField {
  /** Key used in the stored credentials JSON. */
  name: string;
  /** Label shown in the Workshop UI. */
  label: string;
  /** Input rendering hint. `password` masks the value in the UI. */
  type: 'text' | 'password' | 'url';
  required?: boolean;
  placeholder?: string;
  /** Short help text shown under the input. */
  help?: string;
}

/** Static credentials pasted in by the admin (API keys, tokens, shop domains). */
export interface StaticCredentialAuth {
  kind: 'static';
  fields: CredentialField[];
}

/** OAuth 2.0 authorization-code flow (with PKCE). */
export interface OAuthAuth {
  kind: 'oauth';
  /** Authorization endpoint on the provider. */
  authorizeUrl: string;
  /** Token endpoint on the provider. */
  tokenUrl: string;
  /** Scopes to request. */
  scopes: string[];
  /** Name of the env var that holds the OAuth client_id. */
  clientIdEnv: string;
  /** Name of the env var that holds the OAuth client_secret. */
  clientSecretEnv: string;
  /**
   * Optional userinfo endpoint. If set, the framework will fetch it after
   * token exchange and store the response as `metadata` on the connection.
   */
  userInfoUrl?: string;
  /** Override the default token-request content type. */
  tokenAuthStyle?: 'header' | 'body';
}

export type IntegrationAuth = StaticCredentialAuth | OAuthAuth;

export interface IntegrationDefinition {
  /** Stable identifier, e.g. `shopify`, `github`, `slack.workspace`. */
  key: string;
  /** Display name. */
  name: string;
  /** One-sentence description shown in the UI. */
  description: string;
  /** Optional icon URL/path used by the Workshop UI. */
  icon?: string;
  /** Where credentials live. */
  scope: IntegrationScope;
  /** Can you have N of these? */
  multiplicity: IntegrationMultiplicity;
  /** How to authenticate (static credentials or OAuth). */
  auth: IntegrationAuth;
  /**
   * Env vars the builder must set for this integration to work. Checked at
   * startup and surfaced in `/diagnostics`.
   *
   * For OAuth, include `auth.clientIdEnv` and `auth.clientSecretEnv` here so
   * they show up in diagnostics alongside anything else the handler needs.
   */
  requiredSecrets?: string[];
  /**
   * Optional link to external docs (provider console, API reference) shown
   * in the connection-management UI.
   */
  docsUrl?: string;
}

// ─── Connection data shapes ──────────────────────────────────────────────────

/** Canonical shape for OAuth-backed connections. */
export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  /** Unix ms timestamp when the access token expires. */
  expiresAt?: number;
  /** Scopes the provider actually granted (may differ from requested). */
  scope?: string;
}

/**
 * Resolved connection handed to an action handler.
 *
 * `credentials` is always decrypted. Handlers should treat it as sensitive
 * and never log or return it to callers.
 */
export interface ResolvedConnection<TCreds = unknown, TMeta = unknown> {
  id: string;
  integrationKey: string;
  label: string;
  scope: IntegrationScope;
  userId: string | null;
  credentials: TCreds;
  metadata: TMeta | null;
}
