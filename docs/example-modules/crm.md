# CRM — example module

A throwaway two-object CRM bundled with the template so builders can see the Object Studio, action registry, and policy engine in action without any extra setup. Delete it (or copy it) when you fork for a real deployment.

## What it ships

| Kind | Name | Purpose |
|---|---|---|
| Object | `Customer` | Name, email, phone, status, notes |
| Object | `Product` | Name, description, price, status |
| Seed | `shared/db/src/seed-modules/crm.ts` | Three customers + three products |

The module does **not** ship with any custom actions, workflows, or agents — the Object Studio's generated CRUD + action registry already cover list/get/create/update/delete/bulk for both models.

## How it uses the platform

- Both objects use the default `{model}.{op}` permission keys. A deployment wanting to bucket them together can set `permissions: { read: 'crm.read', … }` on each definition.
- Neither object declares `ownership`; `MEMBER` users get `all` access on reads and `own` access on writes, which is fine for a demo but will lock members out of updates. Add `ownership: { ownerField: 'createdByUserId' }` once you add that column.
- `events: true` means `customer.created` / `product.updated` / etc. are emitted automatically by the CRUD runtime. Hook into them with workflow triggers.

## Adapt this example

- **Rename to your domain.** In most cases you don't want "Customer" and "Product". Replace with your actual tier-1 objects (Client + Engagement, Household + Account, School + Cohort).
- **Add ownership.** Add `ownerUserId` to the Prisma model and wire `ownership: { ownerField: 'ownerUserId' }` into the definition. The policy engine scopes member writes automatically.
- **Split the permission namespace.** If you want every CRM object under one permission, set `permissions: { read: 'crm.read', write: 'crm.write', delete: 'crm.delete', bulk: 'crm.bulk' }` on each object and grant those keys from the role map.
- **Custom actions.** Add `shared/actions/src/custom/crm/` for domain-specific operations like `customer.merge` or `product.archive`. Register them with `defineAction()` and the API + MCP expose them for free.

## Remove this example

1. Delete `shared/objects/src/modules/crm.ts` and remove the `...crmObjects` spread in `shared/objects/src/modules/index.ts`.
2. Delete `shared/db/src/seed-modules/crm.ts` and remove the corresponding entry in `shared/db/src/seed-modules/index.ts`.
3. Remove the `Customer` and `Product` models from `shared/db/prisma/schema.prisma`, then run `pnpm db:migrate`.
4. If the Workshop has hand-rolled routes at `apps/workshop/src/app/(app)/customers` or `.../products` from before Object Studio, delete them. The generic `/objects` surface handles the rest.
5. Grep for `customer.` and `product.` permission keys — a clean fork has zero references outside the module code.
6. Delete this file and the "crm" entry in `docs/example-modules/README.md`.

A grep of the following tokens should return nothing after removal: `Customer`, `Product`, `customer.`, `product.`, `crmObjects`, `seedCrm`.
