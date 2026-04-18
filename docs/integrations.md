# Integrations

The template ships a **provider-agnostic** integration framework. There are no
specific providers pre-wired — you declare what you need in code and users
connect accounts through the Workshop UI at runtime.

The framework solves the four hard parts of "connecting a third-party service":

1. **Where do credentials live?** (scope)
2. **How many accounts can you connect?** (multiplicity)
3. **How do you authenticate?** (static vs OAuth)
4. **Who is allowed to use a given connection?** (access control)

Everything else — the action that calls the API, the workflow that schedules
it, the inbox notification when it fails — is built from existing primitives.

## The mental model

| In code                                                          | In the DB                                       |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| `IntegrationDefinition` — what service this is, what auth it uses | `IntegrationConnection` — actual credentials    |
| `ActionDefinition` — what you can DO with the integration        | `ActionExecution` — audit of each run           |

Builders add a definition. Admins add a connection. Action handlers read the
connection at runtime. The framework never hardcodes a provider.

## Scope: org vs user

```ts
scope: 'org'   // credentials belong to the workspace (Shopify, Linear, OpenAI)
scope: 'user'  // credentials belong to a specific user (Gmail, personal GitHub)
```

Pick the scope based on **whose account the credentials represent**. Shopify
API keys represent "your store" — one account per business. A user's Gmail
represents one person's inbox.

User-scoped integrations are implicitly single-instance per user (the registry
rejects `user + multiple`). A user either has Gmail connected or they don't —
there's no "pick between my three Gmails."

## Multiplicity: single vs multiple

```ts
multiplicity: 'single'    // one connection for the whole workspace
multiplicity: 'multiple'  // several connections, callers must pick one
```

Use `multiple` when it's normal to run more than one account of the same
provider — e.g. a marketing agency managing five Shopify stores, or a
reseller with multiple Slack workspaces. Action callers then pass
`connectionId` to `resolveConnection(ctx, key, { connectionId })`.

## Auth: static credentials vs OAuth

**Static** — admin pastes API keys into a form. Good for any service that
issues long-lived tokens (most DB, email, AI, cloud providers):

```ts
auth: {
  kind: 'static',
  fields: [
    { name: 'apiKey', label: 'API key', type: 'password', required: true },
    { name: 'shopDomain', label: 'Shop domain', type: 'url' },
  ],
}
```

**OAuth** — the framework runs the authorize-code + PKCE flow for you:

```ts
auth: {
  kind: 'oauth',
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scopes: ['repo', 'user:email'],
  clientIdEnv: 'GITHUB_CLIENT_ID',
  clientSecretEnv: 'GITHUB_CLIENT_SECRET',
}
```

You register the client_id/client_secret as env vars (diagnostics will warn
if they're missing). The user clicks **Connect** in the Workshop, gets
redirected to the provider, authorizes, and is sent back to
`/settings/integrations/oauth/callback`. Tokens are stored, encrypted, and
made available to handlers. Refresh is handled by `refreshOAuthToken()`.

## Access control

Connections are **role-gated by default**: anyone with `integrations.view`
can use any non-ACL'd org connection, and each user can use their own
user-scoped connections.

For tighter control, admins can attach a per-connection ACL:

```
allowedUserIds = ['user_abc', 'user_def']
allowedRoles   = ['ADMIN']
```

Empty ACLs fall back to role-gated behavior. Non-empty ACLs are strictly
enforced: users must appear in `allowedUserIds` OR hold one of
`allowedRoles`. Agents and bots running unattended can only use non-ACL'd
connections — to use an ACL'd one, the call must be wrapped in an
authenticated user's session (the "delegation" pattern).

## Credentials are encrypted at rest

Set `INTEGRATION_ENCRYPTION_KEY` to a 32-byte base64 value (`openssl rand
-base64 32`). When set, all credentials are encrypted with AES-256-GCM
before being written. When not set, credentials are stored in plaintext
with a one-time console warning — acceptable for local dev, surfaced as a
diagnostics warning in production.

Key rotation: set `INTEGRATION_ENCRYPTION_KEY_PREV` to the old key during
the transition. The decryptor tries the current key first, falls back to
the previous key. Re-save connections to migrate them fully.

## Adding a new integration

In a module that runs at startup (e.g. an action module index file):

```ts
import { registerIntegration } from '@hq/integrations';

registerIntegration({
  key: 'shopify',
  name: 'Shopify',
  description: 'Read orders, products, and customers from a Shopify store.',
  scope: 'org',
  multiplicity: 'multiple',
  auth: {
    kind: 'static',
    fields: [
      { name: 'shopDomain', label: 'Shop domain', type: 'url', required: true },
      { name: 'accessToken', label: 'Admin API access token', type: 'password', required: true },
    ],
  },
  docsUrl: 'https://shopify.dev/docs/apps/auth/admin-app-access-tokens',
});
```

Once registered, the integration appears in `/settings/integrations`.

## Using a connection in an action

```ts
import { resolveConnection } from '@hq/integrations';

defineAction({
  name: 'shopify.orders.listRecent',
  description: 'List the last 50 orders from Shopify.',
  requires: { integration: 'shopify' },  // declarative hint for the UI
  scopes: ['integrations.view'],
  parameters: z.object({ connectionId: z.string().optional() }),
  handler: async (params, ctx) => {
    const conn = await resolveConnection<{ shopDomain: string; accessToken: string }>(
      ctx,
      'shopify',
      { connectionId: params.connectionId },
    );
    const res = await fetch(`https://${conn.credentials.shopDomain}/admin/api/2024-01/orders.json`, {
      headers: { 'X-Shopify-Access-Token': conn.credentials.accessToken },
    });
    return await res.json();
  },
});
```

The resolver handles:

- looking up the right connection based on scope + multiplicity
- decrypting credentials
- enforcing the ACL (throws `IntegrationAccessDeniedError` on denial)
- throwing `IntegrationNotConnectedError` if no connection exists
- throwing `IntegrationAmbiguousError` if multi-instance and no id given

All three errors carry a stable `.code` so the API can return structured
failure responses to the caller.

## What the framework does NOT do

- **No provider SDK bundling.** You use whatever HTTP client or SDK you
  like inside your handler. The framework hands you credentials and gets
  out of the way.
- **No generic "sync" primitive.** If Shopify needs a periodic poller, you
  build it as a `@hq/jobs` handler that calls a sync action. This keeps
  integration-specific behaviour in integration-specific code.
- **No webhook receiver.** Add a Fastify route in `apps/api/src/routes/v1/`
  when you need one. The route can look up the right connection via
  `listConnections` and enqueue a job for processing.
- **No retry/backoff.** The dispatcher records the error on the
  `ActionExecution` row; workflows can branch on that. Add provider-
  specific retry logic in the handler if needed.

Keeping the framework this thin is intentional — the template stays
agnostic, and each integration's quirks live next to its handler rather
than bleeding into shared code.
