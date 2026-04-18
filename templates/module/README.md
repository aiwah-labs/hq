# Module template

A minimal full module — objects, seed rows, and a custom action — as a single
folder you can copy into the right places.

Modules are the preferred way to package a domain vertical. The bundled
examples (`crm`, `projects-tasks`) live inside the main repo because they
are demo content. Your own business domain can live in its own module folder
too so you can delete the examples cleanly.

## What's in here

```
module/
  README.md          — this file
  objects.ts         — shared/objects/src/modules/<name>.ts
  seed.ts            — shared/db/src/seed-modules/<name>.ts
  actions/
    mark-paid.ts     — shared/actions/src/custom/<name>/mark-paid.ts
    index.ts         — shared/actions/src/custom/<name>/index.ts
```

## Wire-up checklist

After copying each file to its target location (paths shown above):

1. **Prisma:** add the model to `shared/db/prisma/schema.prisma` and run
   `pnpm --filter @hq/db migrate`.
2. **Objects index:** in `shared/objects/src/modules/index.ts`, import your
   `<name>Objects` and spread it into `moduleObjects`.
3. **Seed index:** in `shared/db/src/seed-modules/index.ts` (or `seed.ts`
   directly), import `seed<Name>` and call it.
4. **Actions index:** in `shared/actions/src/index.ts`, add
   `import './custom/<name>/index.js';`.
5. **Restart** `pnpm dev:platform`.

## Full removal

Delete the four files above, delete the four registry lines, drop the
Prisma model, and migrate. Clean removal.

## See also

- [docs/modules.md](../../docs/modules.md) — platform vs module convention
- [docs/example-modules/README.md](../../docs/example-modules/README.md) — build-your-own guide
- [docs/example-modules/projects.md](../../docs/example-modules/projects.md) — a real module's remove-checklist
