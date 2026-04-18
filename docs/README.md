# Documentation

## Start here

- [`building-with-hq.md`](building-with-hq.md) — the map: how the five registries fit together, and which `add-*.md` guide to open next.

## Quickstarts

- [`add-object.md`](add-object.md) — add a business entity (schema + registry entry).
- [`add-action.md`](add-action.md) — add a typed operation (UI + API + MCP for free).
- [`add-workflow.md`](add-workflow.md) — add a deterministic multi-step flow.
- [`add-agent.md`](add-agent.md) — add an AI agent with tool access + approval awareness.

## Reference

- [`objects.md`](objects.md) — Object Studio: register a Prisma model into the registry and get list/detail/form/API/MCP for free.
- [`actions.md`](actions.md) — Authoring actions: scope-gated, Zod-validated, auto-exposed over API + MCP.
- [`integrations.md`](integrations.md) — Provider-agnostic integration framework: static credentials, OAuth, per-connection ACL.
- [`import-export.md`](import-export.md) — CSV/JSON import (with preview) and export for every registered object.
- [`files.md`](files.md) — Folders, files, pluggable storage, upload flow, and enrichment cookbook.
- [`operations/backup-restore.md`](operations/backup-restore.md) — Postgres dump/restore, uploaded files, secrets, migration caution.
- [`identity.md`](identity.md) — Canonical `User`, sessions, `IdentityAccount`, and the provider abstraction.
- [`sso.md`](sso.md) — Turning on OIDC SSO with Google/Okta/Azure/Authentik/Keycloak/Auth0.
- [`permissions.md`](permissions.md) — The unified policy engine: principals, permissions, ownership, and `/v1/me/permissions`.
- [`modules.md`](modules.md) — Where the line sits between platform code and swappable example modules.
- [`example-modules/`](example-modules/README.md) — Bundled example modules. Each file includes an "adapt" and a "remove" checklist.

## Templates

- [`../templates/`](../templates/) — runnable skeletons for each registry (object, action, workflow, agent, module).

## Planning

- [`plans/`](plans/) — the HQ 0.3 "Business Ops Template" release plans.
- [`plans/PUNCHSHEET.md`](plans/PUNCHSHEET.md) — live execution tracker.
