/**
 * Auth provider barrel.
 *
 * Apps that need SSO should depend on this surface rather than reaching into
 * individual files — it keeps the public contract stable as we add more
 * providers (SAML, passkey, …).
 */
export * from './types.js';
export * from './upsert.js';
export * as oidc from './oidc.js';

// Re-export a handful of oidc functions as top-level too, since they're the
// common path. Apps can still use the `oidc.*` namespace when they want to be
// explicit about which provider is being spoken to.
export {
  readOidcEnv,
  describeOidcProvider,
  buildAuthorizationRequest,
  exchangeCode,
  decodeIdToken,
  fetchUserInfo,
  identityFromClaims,
  discover as discoverOidc,
} from './oidc.js';

export type { OidcEnv, OidcDiscovery, AuthorizationRequest } from './oidc.js';
