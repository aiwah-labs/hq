# Example modules

Every file under `docs/example-modules/` describes one bundled example module — what it ships, how to adapt the pattern, and how to delete it without leaving orphans.

## Bundled modules

- [`crm.md`](crm.md) — Customer + Product demo. A minimal two-object CRM useful for demos and smoke-testing the Object Studio.
- [`projects.md`](projects.md) — Project + Task example covering ownership-aware permissions, custom actions, workflows, and agents.

See [`docs/modules.md`](../modules.md) for the module convention and the directory layout every module should follow.

## Creating your own module

Start from the nearest bundled module and copy its shape:

1. Copy the `shared/objects/src/modules/<name>.ts` file. Rename the export and the entries.
2. Spread your export into `shared/objects/src/modules/index.ts`.
3. If the module needs sample data, add `shared/db/src/seed-modules/<name>.ts` and register it in `seed-modules/index.ts`.
4. If the module has custom actions, drop them in `shared/actions/src/custom/<name>/`. Workflows and agents follow the same `<name>/` folder pattern.
5. Write `docs/example-modules/<name>.md` with the headers below. Skip sections that don't apply.

Recommended doc structure:

```markdown
# <Module Name>

## What it ships
- <list of objects, actions, workflows, agents>

## How it uses the platform
- <notes on permission keys, ownership, events>

## Adapt this example
- <common changes people make>

## Remove this example
- <numbered deletion checklist>
```
