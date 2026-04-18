# HQ templates

Minimal skeletons for the five registries. Copy, rename, edit, import.

Each file is a runnable starting point — the code compiles and follows the
conventions documented in `docs/add-*.md`.

## Index

| Template | Paired guide | Drop into |
| -------- | ------------ | --------- |
| [`object.ts`](object.ts) | [add-object](../docs/add-object.md) | `shared/objects/src/modules/` |
| [`action.ts`](action.ts) | [add-action](../docs/add-action.md) | `shared/actions/src/custom/<folder>/` |
| [`workflow.ts`](workflow.ts) | [add-workflow](../docs/add-workflow.md) | `shared/workflows/src/workflows/<folder>/` |
| [`agent.ts`](agent.ts) | [add-agent](../docs/add-agent.md) | `shared/agents/src/agents/` |
| [`module/`](module/) | [example-modules](../docs/example-modules/README.md) | full-module scaffold |

## How to use

1. Copy the template to the target folder shown above.
2. Rename the symbol(s) to match your domain.
3. Add one line to the relevant `index.ts` so the registry picks it up (each
   template has the exact line in a `REGISTER:` comment).
4. Restart `pnpm dev:platform`.

Templates are intentionally small — they show the shape, not the corner cases.
The `docs/add-*.md` guides cover field types, policies, triggers, and
approval. Refer to those once you've got the skeleton compiling.
