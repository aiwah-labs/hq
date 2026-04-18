# HQ release smoke checklist

Run this on a clean checkout of the release tag before cutting. Every
step should take less than a minute; the whole checklist fits under 15.

A release is **not** shippable until every box here is checked on a
clean machine that has never run HQ before.

---

## 0. Clean slate

```bash
rm -rf .hq-storage shared/db/.env apps/*/.env.local
docker rm -f hq-postgres 2>/dev/null || true
```

- [ ] No stale volumes, no `.env.local` files, no `.hq-storage/` directory.

## 1. Install

```bash
pnpm install
```

- [ ] Install succeeds on Node 22+ and pnpm 10+.
- [ ] No peer-dep warnings you haven't seen before.

## 2. Typecheck + tests

```bash
pnpm typecheck
pnpm test
```

- [ ] `pnpm typecheck` exits clean.
- [ ] `pnpm test` exits clean — **all** workspace packages green.
- [ ] Snapshot the test count in the release notes (`N/N` per package).

## 3. Bootstrap the local DB

```bash
pnpm db:local:bootstrap
```

- [ ] Postgres container starts.
- [ ] Migrations run.
- [ ] Seed runs — CRM rows (Customer, Product) and Projects/Tasks rows present.
- [ ] `shared/db/.env` + `apps/*/.env.local` generated.

## 4. Doctor

```bash
pnpm doctor
```

- [ ] Every check passes. If a check is yellow, it's in the release notes
      as a known limitation. Red = blocker.

## 5. Platform up

```bash
pnpm dev:platform
```

- [ ] Workshop serves on http://localhost:3002.
- [ ] API serves on http://localhost:3003.
- [ ] No unhandled errors in either stdout stream for 30 seconds.

## 6. Login + Workshop sanity

Log in at http://localhost:3002 with `admin@example.com` / `password`.

- [ ] Login succeeds.
- [ ] `/` dashboard renders without console errors.
- [ ] `/objects` lists at least one module's objects.
- [ ] `/objects/Customer` opens, rows render from seed data.
- [ ] Click a customer → detail page renders, activity timeline loads.
- [ ] `/projects` renders at least one seeded project.
- [ ] `/projects/<id>` opens, tasks render, "blocked" widget works.
- [ ] `/agents` shows at least one registered agent + its capabilities.
- [ ] `/approvals` renders (empty is fine; page should not error).
- [ ] `/diagnostics` renders; `/api/health` returns 200.
- [ ] `/activity` shows recent events (login, seed writes).
- [ ] `/jobs` renders; at least one scheduled job (`files.sweep-temp`)
      is listed.
- [ ] `/inbox` renders.
- [ ] `/files` renders the root folder.

## 7. Action dispatch path

```bash
# from repo root, with API running
curl -sS -H "Authorization: Bearer <DEV_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"params": {}}' \
  http://localhost:3003/v1/actions/Customer.list | jq '.data | length'
```

- [ ] Returns a positive integer — auto-registered CRUD action works
      via the dispatcher.
- [ ] `curl .../v1/actions/Customer.list/schema` returns a Zod-shaped
      JSON schema.

## 8. Permissions surface

```bash
curl -sS -H "Authorization: Bearer <DEV_TOKEN>" \
  http://localhost:3003/v1/me/permissions | jq '.permissions | length'
```

- [ ] Returns the resolved permission list for the logged-in user.
- [ ] `.objects.Customer.access` returns an access level (`read` or higher).

## 9. Files upload

From Workshop `/files`:

- [ ] Create a new folder.
- [ ] Upload a small file (any mime).
- [ ] Rename it.
- [ ] Delete it — `file.deleted` event appears in `/activity`.

## 10. MCP

```bash
pnpm mcp
# in another terminal, send the MCP initialization handshake
```

- [ ] Server starts on stdio without errors.
- [ ] `tools/list` response includes at least one auto-registered CRUD
      tool (e.g. `Customer.list`).
- [ ] Calling a tool returns the dispatcher result.

## 11. Workflow + agent round-trip (optional but strongly preferred)

- [ ] Run a bundled workflow from Workshop → run completes, timeline
      shows per-step executions.
- [ ] Trigger an agent run with a scope-gated action → approval queue
      fires if the action is gated; action runs otherwise.

## 12. Production deploy rehearsal

On a **throwaway Ubuntu 22/24 VM** (or equivalent):

```bash
curl -fsSL <release-tag>/scripts/setup-server.sh | bash
git clone --branch <tag> https://github.com/aiwah-labs/hq /opt/hq
cd /opt/hq && cp .env.example .env.prod
# fill in DATABASE_URL, SESSION_SECRET, INTERNAL_API_SECRET
bash scripts/first-deploy.sh
```

- [ ] `first-deploy.sh` completes.
- [ ] `curl http://localhost:3003/api/health` returns 200.
- [ ] `bash scripts/setup-nginx.sh <domain>` completes.
- [ ] Fresh domain serves Workshop over HTTPS.

## 13. Docs scan

- [ ] `docs/README.md` links all resolve.
- [ ] `README.md` quickstart commands match the checked-out scripts
      (`db:local:bootstrap`, `dev:platform`, `doctor`).
- [ ] `docs/releases/0.3.md` commit list matches `git log` since the
      previous release tag.
- [ ] Screenshots in `docs/` (when captured) reflect the UI at this tag.

## 14. Release cut

Only when everything above is green:

- [ ] Tag: `git tag v0.3.0 && git push origin v0.3.0`.
- [ ] GitHub release notes = paste `docs/releases/0.3.md`.
- [ ] Announce per channel plan (separate doc).

---

## Screenshot shot list

Capture at release-cut time from a freshly seeded Workshop, 1440×900
viewport, light theme. Commit to `docs/assets/screenshots/` and link from
the relevant reference docs.

| Screenshot | Path in Workshop | Docs that reference it |
| --- | --- | --- |
| `dashboard.png` | `/` | `README.md` hero, `docs/README.md` |
| `object-studio.png` | `/objects` | `docs/objects.md`, `docs/add-object.md` |
| `object-detail.png` | `/objects/Customer/<id>` | `docs/objects.md` |
| `projects.png` | `/projects` | `docs/example-modules/projects.md` |
| `task-activity.png` | `/projects/<id>/<task>` with activity expanded | `docs/events.md` |
| `agents.png` | `/agents` | `docs/agents.md`, `docs/add-agent.md` |
| `approvals.png` | `/approvals` with one pending item | `docs/agents.md`, `docs/actions.md` |
| `diagnostics.png` | `/diagnostics` | `docs/operations/diagnostics.md` |
| `workflow-run.png` | a completed run in `/workflows/runs/<id>` | `docs/workflows.md` |
| `inbox.png` | `/inbox` with a few items | `docs/README.md` |
| `files.png` | `/files` with a few folders | `docs/files.md` |

If any shot can't be captured (feature not demoable in seed data), seed
an example in `seed.ts` rather than mocking the screenshot.

---

## Rollback

If you cut and something slips through the net:

1. Don't delete the tag. Cut `v0.3.1` with the fix.
2. Add a "known issue" note to `docs/releases/0.3.md` pointing at the
   patch tag.
3. If the bug is in `first-deploy.sh`: publish a one-line fix commit
   *and* update `scripts/setup-server.sh` so new installs don't hit it.
