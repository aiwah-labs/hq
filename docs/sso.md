# SSO (Single Sign-On)

HQ ships with a dependency-free OIDC Authorization Code starter. It works with any spec-compliant IdP: Google Workspace, Okta, Azure AD / Entra ID, Authentik, Keycloak, Auth0, and others.

Read `docs/identity.md` first — it explains the `User` / `IdentityAccount` model the SSO flow writes into.

---

## Turn it on

All behavior is environment-driven. No code changes needed.

```bash
# Minimum to enable
AUTH_OIDC_ENABLED=true
AUTH_OIDC_ISSUER_URL=https://accounts.google.com
AUTH_OIDC_CLIENT_ID=your-client-id
AUTH_OIDC_CLIENT_SECRET=your-client-secret
AUTH_OIDC_REDIRECT_URI=https://your-hq.example.com/api/auth/oidc/callback

# Role mapping
AUTH_ADMIN_EMAILS=founder@example.com,ops@example.com
AUTH_ADMIN_GROUPS=hq-admins
AUTH_OIDC_ROLE_CLAIM=groups    # default; change if your IdP uses a different claim
AUTH_DEFAULT_ROLE=MEMBER       # role assigned to newly provisioned users

# Auto-provisioning
AUTH_AUTO_PROVISION=true
AUTH_OIDC_ALLOWED_DOMAINS=example.com,partner.com

# UI label
AUTH_OIDC_LABEL=Continue with Google
AUTH_OIDC_SCOPES=openid email profile
```

When the env is set:

1. Workshop's `/login` page shows a "Continue with SSO" link.
2. `GET /api/auth/oidc/start` redirects to your IdP.
3. `GET /api/auth/oidc/callback` exchanges the code, resolves to a `User`, mints a session, and redirects to `/workshop`.

---

## IdP-specific notes

### Google Workspace

```bash
AUTH_OIDC_ISSUER_URL=https://accounts.google.com
AUTH_OIDC_SCOPES=openid email profile
```

Google does not emit group claims by default. Map admins via `AUTH_ADMIN_EMAILS`.

### Okta

```bash
AUTH_OIDC_ISSUER_URL=https://{your-tenant}.okta.com
AUTH_OIDC_SCOPES=openid email profile groups
AUTH_OIDC_ROLE_CLAIM=groups
```

Create a custom `groups` claim in the authorization server's claim settings, then list your admin groups in `AUTH_ADMIN_GROUPS`.

### Azure AD / Entra ID

```bash
AUTH_OIDC_ISSUER_URL=https://login.microsoftonline.com/{tenant-id}/v2.0
AUTH_OIDC_SCOPES=openid email profile
AUTH_OIDC_ROLE_CLAIM=roles
```

Assign app roles in Entra, or enable the `groups` claim for group-based mapping.

### Authentik

```bash
AUTH_OIDC_ISSUER_URL=https://authentik.example.com/application/o/{slug}/
AUTH_OIDC_SCOPES=openid email profile
AUTH_OIDC_ROLE_CLAIM=groups
```

### Keycloak

```bash
AUTH_OIDC_ISSUER_URL=https://keycloak.example.com/realms/{realm}
AUTH_OIDC_ROLE_CLAIM=groups
```

Add a "Group Membership" mapper on the client scope with claim name `groups`.

### Auth0

```bash
AUTH_OIDC_ISSUER_URL=https://{tenant}.auth0.com/
AUTH_OIDC_ROLE_CLAIM=https://hq.example.com/groups
```

Auth0 namespaces custom claims; configure the same namespaced claim in your Action/Rule.

---

## How the callback works

`apps/workshop/src/app/api/auth/oidc/callback/route.ts`:

1. Validate `state` cookie matches the `state` query param (CSRF protection).
2. `exchangeCode()` — POST the authorization code to the IdP's token endpoint.
3. `decodeIdToken()` — parse the JWT payload. **The template does not verify the signature**; it does verify `nonce` matches the cookie. Verify signatures in production (see below).
4. `fetchUserInfo()` — optional; some IdPs put groups only here.
5. `identityFromClaims()` — project OIDC claims into an `AuthenticatedIdentity`.
6. `upsertUserFromIdentity()` — resolve to the canonical `User`:
   - Existing `IdentityAccount` → reuse.
   - Email matches existing `User` → link.
   - Otherwise → auto-provision if `AUTH_AUTO_PROVISION=true` and the email domain is allowed.
7. `createSession()` → set the session cookie → redirect to `/workshop`.

### Production hardening

The template ships without signature verification to keep the dependency footprint at zero. Before going live:

```bash
pnpm add jose
```

Then replace `decodeIdToken` with:

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';
const JWKS = createRemoteJWKSet(new URL(disc.jwks_uri));
const { payload } = await jwtVerify(tokens.id_token, JWKS, {
  issuer: disc.issuer,
  audience: config.clientId,
});
```

The rest of the callback stays the same.

---

## Role and domain mapping

Precedence (highest first):

1. **`AUTH_SUPERADMIN_EMAILS`** — env-governed, never set from SSO.
2. **`AUTH_ADMIN_EMAILS`** — if the user's email is in the list, they become `ADMIN`.
3. **`AUTH_ADMIN_GROUPS`** — if any group from `AUTH_OIDC_ROLE_CLAIM` matches, they become `ADMIN`.
4. **`AUTH_DEFAULT_ROLE`** — the fallback for newly provisioned users.

`AUTH_OIDC_ALLOWED_DOMAINS` is a hard gate: if non-empty, the user's email domain must be in the list or auto-provisioning fails with `denied: 'domain'`. Existing users are unaffected.

Set `AUTH_AUTO_PROVISION=false` if you want "invite only" — only users that already exist in HQ can log in via SSO, everyone else gets `denied: 'no_auto_provision'`.

---

## When to use SAML instead of OIDC

OIDC is simpler, JSON-based, and widely supported by modern IdPs. Reach for SAML only when:

- Your IdP doesn't support OIDC (rare today).
- You're working with an enterprise IT team that has standardized on SAML.
- You need SAML-only features (e.g. federated attribute push that your IdP doesn't expose over OIDC).

The provider abstraction (`@hq/auth/providers`) leaves room for a future `saml` provider. We're not shipping it in the template.

---

## Out of scope

- Hosted auth (e.g. Auth0, Clerk, Stack, WorkOS hosted pages).
- SCIM provisioning — HQ provisions lazily on first sign-in.
- Per-IdP UI ("Sign in with Google" button variants).
- Multiple OIDC providers active at once.

Full identity model lives in [`docs/identity.md`](identity.md).
