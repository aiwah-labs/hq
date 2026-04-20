# Permissions

HQ ships with one policy engine that answers **"can this principal do that?"** for every surface — humans in the Workshop, bots hitting the REST API, internal agents running inside workflows, and MCP clients calling actions on behalf of an agent. Every authorization decision flows through the same `can()` function.

There is no ACL table, no Casbin rules file, no per-route middleware with bespoke logic. A role map, a handful of object-level permission keys, and ownership hints on individual object definitions produce a capability set that the engine evaluates.

## Core concepts

| Concept | Description |
|---|---|
| **Principal** | Who is asking. `UserPrincipal`, `BotPrincipal`, or `AgentPrincipal` (see `shared/auth/src/types.ts`). |
| **PermissionKey** | A platform capability (`users.manage`, `audit.view`, `task.update`). Object CRUD uses the `{model}.{op}` shape. |
| **PermissionMap** | `Record<PermissionKey, boolean>`. Static per role, extended per-user by SSO group mapping and per-bot by explicit grants. |
| **AccessLevel** | `'all' \| 'own' \| 'none'`. Decides whether to scope reads/writes by ownership. |
| **Ownership** | Per-object hint (`ownerField`, `assigneeField`, `extraFields`) telling the engine which record fields "count" as ownership. |

## The decision path

```ts
import { can } from '@hq/auth/policy';

const decision = can(principal, {
  object: { type: 'Task', op: 'update', record: existing },
}, { ownership: { ownerField: 'ownerUserId' } });

if (!decision.allowed) {
  // decision.reason === 'missing_permission' | 'wrong_owner' | 'no_access_level'
}
```

The engine evaluates request shapes in this order:

1. **`permission`** — a plain permission-key check. Admins always pass.
2. **`object`** — `{ type, op, record? }`. Resolves an access level (`all`/`own`/`none`). For `own` without a record, the decision is _allowed-but-scope-by-owner_ (useful for `list` calls where you need to inject a where-clause). For `own` with a record, the engine calls `recordBelongsToUser`.
3. **`action`** — `{ name, permissions[] }`. _All_ listed permissions must pass.

The bypass rules are intentionally short:

- `effectiveRole === 'ADMIN' || 'SUPERADMIN'` → every check returns allowed.
- Bots and agents use their `scopes` array. If `scopes.includes('{object}.{op}')`, they get `all` access for that op.
- Members default to `all` reads and `own` writes for objects.

## Role map

`shared/auth/src/policy.ts` ships with two tiers:

```ts
buildPermissionMap('ADMIN')  // workshop, content, settings, users, identity,
                             // bots, agents, workflows, approvals, actions, audit
buildPermissionMap('MEMBER') // workshop, content, settings.view, bots.view+create,
                             // agents.view, workflows.view+execute, approvals.view,
                             // actions.view+execute, messaging.view
```

`SUPERADMIN` is a flag on `UserPrincipal`, not a separate tier — the bypass in `hasPermission` covers it.

## Per-object permissions

Every object in `shared/objects/src/registry.ts` automatically receives five permission keys derived from the model name:

```ts
// Task → task.read, task.create, task.update, task.delete, task.bulk
```

Builders can override the shape in the definition when they want to share permissions across objects:

```ts
export const invoiceLine: ObjectDefinition = {
  model: 'InvoiceLine',
  // …
  permissions: {
    read: 'billing.read',
    update: 'billing.write',
    // unspecified ops default to `{model}.{op}` (e.g. `invoiceline.delete`)
  },
  ownership: {
    ownerField: 'createdByUserId',
  },
};
```

At runtime, `resolveObjectPermissions(def)` returns the fully-resolved shape; `getObjectOwnership(def)` returns the ownership hints. The serialized schema exposes both so API consumers and UIs can make the same decisions without reimplementing the derivation.

## Ownership

Ownership is opt-in per object. When configured, `recordBelongsToUser(record, userId, ownership)` returns `true` if any of the configured fields on the record match the user. The fields are a flat list — `ownerField`, `assigneeField`, then each name in `extraFields`. This keeps "did Alice create this?", "was it assigned to Bob?", and "did Bob leave a comment?" checkable from one place.

The CRUD runtime (`shared/objects/src/crud.ts`) calls this automatically:

- `objectList` / `objectCount`: when the principal has `own` access, a where-clause of `{OR: [{ownerField: userId}, …]}` is merged in.
- `objectGet`: after loading the record, the engine fails with "not owner" if the record doesn't belong to the caller.
- `objectUpdate` / `objectDelete`: loads the existing record, runs `can()`, then writes.
- `objectBulkUpdate` / `objectBulkDelete`: filters the target set down to records the user owns before writing.

## The action dispatcher

Every executable surface — the REST API, the MCP server, workflow steps — funnels through `dispatchAction(name, params, principal)` (`shared/actions/src/dispatch.ts`). The dispatcher:

1. Looks up the action in the registry.
2. Runs `can(principal, { action: { name, permissions: action.scopes } })`. Every scope on the action must pass.
3. Validates params against the action's zod schema.
4. Builds a `ServiceContext` from the principal and invokes the handler.

This is the only integration point that calls handlers, so you can trust that "action X is callable" implies the permission check has already run.

## `/v1/me/permissions`

Clients that need to gate UI (show/hide buttons, greyed-out menu items) fetch `/v1/me/permissions` and cache the shape:

```json
{
  "kind": "user",
  "effectiveRole": "MEMBER",
  "isSuperadmin": false,
  "permissions": {
    "workshop.view": true,
    "users.manage": false,
    "task.read": false,
    "...": "..."
  },
  "scopes": ["task.read", "task.update"],
  "objectAccess": {
    "Task": { "read": "all", "create": "own", "update": "own", "delete": "own", "bulk": "own" },
    "Project": { "read": "all", "create": "none", "update": "none", "delete": "none", "bulk": "none" }
  }
}
```

`permissions` is the principal's `PermissionMap`. `scopes` echoes raw bot/agent scopes (useful for admin surfaces). `objectAccess` computes `resolveObjectAccess` for every registered object — this is the single source of truth for UI gating and should be consulted before hiding or disabling anything.

## SSO group → capability mapping

When an SSO claim includes `groups`, `upsertUserFromIdentity` (see `docs/sso.md`) can promote the user to `ADMIN` based on `OIDC_ADMIN_GROUPS`. Group-driven object permissions are TODO; the plan is to let deployments declare extra `PermissionMap` entries per group in an env var (`OIDC_GROUP_PERMISSIONS`), which upsert merges into the principal at session creation time.

## Testing

Every `can()` path has direct coverage in `shared/auth/src/__tests__/policy-engine.test.ts`. Every CRUD entry point has ownership coverage in `shared/objects/src/__tests__/crud-policy.test.ts`. The dispatcher is exercised end-to-end in `shared/actions/src/__tests__/dispatch.test.ts`.

When adding a new permission check, write a denial test first. The rule in `CLAUDE.md` is non-negotiable: _auth is tested on every route._
