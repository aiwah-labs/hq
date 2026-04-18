# Changelog

All notable changes to HQ are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Full per-release notes live in [`docs/releases/`](docs/releases/).

## [Unreleased]

_Nothing yet._

## [0.3.0] — 2026-04-18 — Business Ops Template

**Full notes:** [`docs/releases/0.3.md`](docs/releases/0.3.md)

### Added

- **Object Studio** — registry-driven CRUD. Register a Prisma model once,
  get list/detail/form/API/MCP/permissions for free. Auto-generated
  `<type>.list/.get/.create/.update/.delete/.bulk_*` actions. File,
  files, and folder field types.
- **Identity & SSO template** — nullable password, `IdentityAccount`
  model, provider abstraction, generic OIDC starter
  (Google/Okta/Azure/Authentik/Keycloak/Auth0), env-driven
  domain/role mapping.
- **Unified permission model** — one `can()` engine for users, bots,
  agents, and MCP clients. Expanded `PermissionKey` vocabulary.
  Policy checks wired into object CRUD, action dispatcher, and Workshop
  routes. `GET /v1/me/permissions` for resolved capabilities.
- **Template module boundaries** — explicit split between
  `platformObjects` and `moduleObjects`. Seeds under `seed-modules/`.
- **CRM example module** — Customer and Product, registry-driven.
- **Projects & Tasks example module** — `Project` + `Task` with
  canonical-`User` ownership and assignment, portfolio view, blocked-tasks
  widget, activity timeline. Fully removable.
- **Agent governance + MCP parity** — agents call the same dispatcher
  as Workshop/API/workflows. Actions expose scopes, approvals, and
  schemas uniformly. MCP tools auto-generated from registered actions.
- **Activity timeline** — every mutation, action, workflow step, agent
  turn, approval, and file event lands in `platform_events`.
  `pg_notify` streams to Workshop + diagnostics. In-process
  `subscribe()` handles enrichment.
- **Diagnostics surface** — health endpoint, env warnings, recent
  failures, event replay.
- **Setup & deploy polish** — `pnpm doctor`, expanded `.env.example`,
  `scripts/setup-server.sh`, `scripts/first-deploy.sh`,
  `scripts/setup-nginx.sh`, rewritten README + DEPLOY.
- **Jobs & scheduling** — `enqueueJob`, `cancelJob`, `listJobRuns`,
  Workshop jobs page. `pg-boss` under the hood.
- **Inbox & notifications** — `InboxItem` model, service, API, Workshop
  UI. Approval notifications auto-surface.
- **Integrations framework** — provider-agnostic shape: static
  credentials, OAuth, per-connection ACL, secret storage.
- **Import / export** — CSV/JSON export for every registered object;
  preview-validate-commit import flow.
- **Files & folders** — filesystem-shaped model (folders + files,
  nested paths, USER/SYSTEM/TEMP kinds), pluggable `StorageAdapter`
  (local + S3/R2/MinIO), presigned + passthrough upload,
  `files.sweep-temp` lifecycle job, `file`/`files`/`folder` field types.
- **Builder quickstarts** — `docs/building-with-hq.md` architecture
  map; `docs/add-object.md`, `docs/add-action.md`, `docs/add-workflow.md`,
  `docs/add-agent.md` for adding each registry type.
- **Runnable templates** — single-file skeletons under `templates/` for
  objects, actions, workflows, agents, and a full `templates/module/`
  bundle.
- **Workflow reference** — `docs/workflows.md` covering node types,
  triggers, expressions, evals, execution model, persistence, events.
- **Events reference** — `docs/events.md` covering the open catalog,
  `emitEvent`, in-process `subscribe()`, and streaming via
  `platform_events`.
- **Release infrastructure** — `CHANGELOG.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, GitHub PR and issue templates, release notes,
  smoke checklist.

### Changed

- **Auth schema** — `User.passwordHash` is now nullable; `IdentityAccount`
  model added for SSO links.
- **Permissions vocabulary** — old ad-hoc `checkPermission` calls
  replaced by the central policy engine. See
  [`docs/permissions.md`](docs/permissions.md).
- **Action surface** — routes, workflows, agents, and MCP now call
  actions via `dispatchAction`; prior direct-service-call patterns no
  longer inherit policy or audit.
- **README + DEPLOY** — rewritten for the template positioning.

### Deprecated

_None._

### Removed

_None — this is the first public release._

### Fixed

- Standing pre-baseline test failures across `@hq/auth`, `@hq/services`,
  `@hq/workflows`, `@hq/objects`, `@hq/actions` resolved as part of the
  respective plan commits.

### Security

- Sessions store hashed tokens instead of plaintext.
- Soft-revoke replaces hard-delete for session and identity records.

[Unreleased]: https://github.com/aiwah-labs/hq/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/aiwah-labs/hq/releases/tag/v0.3.0
