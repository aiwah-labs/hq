/**
 * @hq/integrations — provider-agnostic integration framework.
 *
 * Builders declare integrations in code via `registerIntegration(def)`. At
 * runtime, users connect accounts through the Workshop UI; connections are
 * stored in the DB with encrypted credentials. Action handlers resolve the
 * current connection with `ctx.getConnection(key)`.
 *
 * See `docs/integrations.md` for the full mental model.
 */
export * from './types.js';
export {
  registerIntegration,
  getIntegration,
  listIntegrations,
  resetIntegrationRegistry,
} from './registry.js';
export {
  createConnection,
  listConnections,
  deleteConnection,
  updateConnection,
  readConnectionInternal,
  type CreateConnectionInput,
  type ListConnectionsOptions,
  type UpdateConnectionAclInput,
} from './connections.js';
export {
  resolveConnection,
  markConnectionUsed,
  IntegrationNotConnectedError,
  IntegrationAccessDeniedError,
  IntegrationAmbiguousError,
  type GetConnectionOptions,
} from './resolve.js';
export {
  encryptCredentials,
  decryptCredentials,
  isEncryptionConfigured,
} from './encrypt.js';
export {
  startOAuthFlow,
  completeOAuthFlow,
  refreshOAuthToken,
  type OAuthStartInput,
  type OAuthStartResult,
  type OAuthCompleteInput,
  OAuthStateError,
  OAuthTokenError,
} from './oauth.js';
