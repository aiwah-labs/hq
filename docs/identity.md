# Identity

HQ ships with a canonical `User` as the one true platform actor. Projects, tasks, messages, sessions, audit logs, permission checks — they all reference `User.id`. Domain modules should never invent their own `Person`, `Employee`, or `Member` table.

> SSO proves who someone is. HQ decides what they can do.

---

## Data model

```
User (canonical actor)
 ├── passwordHash      — null when the user is SSO-only
 ├── role              — ADMIN | MEMBER
 ├── status            — ACTIVE | INACTIVE
 ├── deletedAt         — soft-delete marker
 ├── Session[]         — hashed tokens with revocation
 └── IdentityAccount[] — zero or many external identities
```

### `User`

The only actor table in the system. `email` is unique (case-insensitive by convention — lower-cased at write time). `passwordHash` is nullable so that SSO-only users can exist without a credential HQ needs to manage.

`deletedAt` is irreversible soft-delete. `status = INACTIVE` is for reversible suspension (e.g. offboarding someone who might return).

### `Session`

Stores `tokenHash = SHA-256(rawToken)` — the raw token is handed to the client once and never stored. Use the helpers in `@hq/auth/sessions`:

```ts
import { createSession, getSessionUser, revokeSession } from '@hq/auth/sessions';

const token = await createSession(userId, { ipAddress, userAgent });
// → set as httpOnly cookie

const user = await getSessionUser(rawToken);
// → null when expired, revoked, or the user is INACTIVE/deleted

await revokeSession(rawToken);
// → soft-revokes (sets revokedAt), preserving the row for audit
```

Sessions auto-expire after 30 days. Set a different TTL with `createSession(userId, { ttlMsOverride })`.

### `IdentityAccount`

One row per external identity tied to a `User`. The key is `(provider, providerId, subject)`:

| Column | Example |
|---|---|
| `provider` | `OIDC`, `SAML`, or `LOCAL` (reserved) |
| `providerId` | `google`, `okta`, `azure-ad`, `authentik` — the IdP instance |
| `subject` | The external stable ID (OIDC `sub`, SAML `NameID`) |
| `email` | Email claim at last sign-in (refreshed on every login) |
| `rawProfile` | Entire claims payload, for audit |

One user can have several identities — e.g. a human linked to both `google` and `okta` during a migration.

`LOCAL` in the enum is reserved; we don't currently write `IdentityAccount` rows for local-password users (a non-null `passwordHash` is the signal).

---

## Provider abstraction

`@hq/auth/providers` is the seam between the IdP and HQ:

```
IdP (Google, Okta, Azure, …)
      │
      ▼
AuthProvider adapter        ← local | oidc | (saml future)
      │
      ▼
AuthenticatedIdentity       ← provider-agnostic claims
      │
      ▼
upsertUserFromIdentity()    ← maps to canonical User
```

Types live in `shared/auth/src/providers/types.ts`:

- `AuthProvider` — runtime config (id, type, enabled, label)
- `AuthenticatedIdentity` — the output of any provider: `{ providerId, providerType, subject, email, name?, rawProfile?, groups? }`
- `UpsertOptions` — auto-provision flag, default role, admin emails/groups, allowed domains

### `upsertUserFromIdentity(identity, opts)`

Three-step resolution:

1. **Existing identity** → if an `IdentityAccount` with the same `(provider, providerId, subject)` exists, reuse its user. Refresh `email` + `rawProfile`.
2. **Email match** → if a `User` with the same email exists, link the identity to that user (this handles "local user turns on SSO").
3. **Auto-provision** → if `allowAutoProvision` is true and the email domain is allowed, create a new user with the resolved role.

Inactive or soft-deleted users are always denied — SSO cannot revive a deactivated account.

---

## Local authentication

Local password auth is the default provider; it's the minimum HQ needs to start.

- `POST /login` → Workshop Server Action `loginAction` (see `apps/workshop/src/app/(auth)/login/actions.ts`).
- Password is verified with bcrypt via `@hq/auth/passwords`.
- On success, `createSession` is called and the cookie is set.

Local password fields are hidden for SSO-only users (those with `passwordHash = null`).

---

## Role model

HQ has two built-in roles: `ADMIN` and `MEMBER`. They map to the permission map defined in `@hq/auth/policy`.

Superadmin status is env-governed via `AUTH_SUPERADMIN_EMAILS` — it is never derived from the IdP alone. This keeps the keys of the kingdom in the HQ deployment, not in the IdP config.

---

## Out of scope (for now)

- SCIM provisioning
- Multi-tenant organization scoping
- Passkeys / WebAuthn
- Magic link email login
- SAML (wired into the provider interface; implementation comes later)

These are left intentionally unimplemented in the template. The provider abstraction makes each one a well-scoped addition rather than a schema rewrite.
