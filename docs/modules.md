# Modules

HQ is a template. When you fork it for a real deployment, you'll keep the platform layer and swap out the example modules. This page describes where the line lives and how to add your own module without cluttering the platform.

## The two layers

```
Platform code                Example module code
──────────────                ───────────────────
shared/db/prisma              shared/objects/src/modules/<name>.ts
shared/auth                   shared/actions/src/custom/<name>/
shared/events                 shared/workflows/src/workflows/<name>/
shared/services/context.ts    shared/agents/src/agents/<name>/
shared/objects/src/           shared/db/src/seed-modules/<name>.ts
  (registry/crud/schema)      apps/workshop/src/app/(app)/<name>/
shared/actions/src/           apps/workshop/src/components/<name>/
  (registry/dispatch/schema)  docs/example-modules/<name>.md
apps/api/src/routes/v1
apps/workshop/src/app/(auth)
apps/workshop/src/app/(app)/objects
apps/workshop/src/app/(app)/users
...
```

**Platform** is what every deployment needs: auth, DB, object machinery, action machinery, the policy engine, the generic Object Studio UI, the Users admin. It shouldn't change when you add or remove an example module.

**Example modules** are demonstrations of the platform in use. They're the pieces you'll inevitably rename or delete.

## Module anatomy

A module is a collection of files that tell one coherent story about one business domain. The convention is:

| Area | File | Required |
|---|---|---|
| Object definitions | `shared/objects/src/modules/<name>.ts` | yes, if the module has objects |
| Object registration | `shared/objects/src/modules/index.ts` | yes — spread the module's objects into `moduleObjects` |
| Custom actions | `shared/actions/src/custom/<name>/index.ts` | optional |
| Workflows | `shared/workflows/src/workflows/<name>/` | optional |
| Agents | `shared/agents/src/agents/<name>/` | optional |
| Sample data | `shared/db/src/seed-modules/<name>.ts` | optional but recommended for demo modules |
| Workshop routes | `apps/workshop/src/app/(app)/<name>/` | optional if you're fine with the generic Object Studio |
| Doc | `docs/example-modules/<name>.md` | yes if the module ships as an example |

## Adding a module

1. **Register the objects.** Create `shared/objects/src/modules/<name>.ts` that exports `Record<string, ObjectDefinition>`. Spread it into `moduleObjects` in `shared/objects/src/modules/index.ts`. The registry auto-exposes everything — CRUD actions, MCP tools, list/form/detail UI — without any further wiring.

2. **Seed the data.** Add `shared/db/src/seed-modules/<name>.ts` exporting `seed(db)`. Register it in `shared/db/src/seed-modules/index.ts`. The main seed calls every module seed in order.

3. **Add custom actions if needed.** Use `shared/actions/src/custom/<name>/` — follow the pattern in `shared/actions/src/custom/demo/`. Register them with `defineAction()`.

4. **Write the doc.** `docs/example-modules/<name>.md` should include:
   - A one-paragraph "what this module does"
   - A list of objects, actions, workflows, agents it ships with
   - A "Remove this example" checklist for when the forker decides to cut it
   - An "Adapt this example" checklist for when they want to copy the pattern

5. **Optional: custom Workshop UI.** Only reach for a custom route when the generic Object Studio isn't enough (dense dashboards, cross-object views). Most CRUD needs are already covered.

## Removing a module

Every example module's doc ends with a numbered removal checklist. Example flow for the CRM demo (`docs/example-modules/crm.md`):

1. Delete `shared/objects/src/modules/crm.ts` and its import/spread in `modules/index.ts`.
2. Delete `shared/db/src/seed-modules/crm.ts` and its entry in `seed-modules/index.ts`.
3. Remove `Customer`/`Product` Prisma models from `shared/db/prisma/schema.prisma` and run `pnpm db:migrate`.
4. Delete `apps/workshop/src/app/(app)/customers` and `.../products` (if you customized them).
5. Search the repo for `customer.` and `product.` permission keys and remove hand-rolled references.
6. Delete `docs/example-modules/crm.md`.

## Why not a plugin system?

A plugin system in 0.3 would add more ceremony than signal. The template-with-conventions approach wins on:

- **Grepability** — `grep -r "modules/crm"` finds every wire-up in seconds.
- **Forkability** — builders can delete four files and a spread, not reason about lifecycle hooks.
- **Simplicity** — no dynamic loading, no `plugin.register()`, no runtime resolution order.

When a deployment truly needs runtime plug-in loading (e.g. third-party integrations built by customers), the platform can grow one. Until then, files and imports are the boundary.
