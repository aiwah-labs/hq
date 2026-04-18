# Diagnostics and Observability

HQ ships a diagnostics surface that gives self-hosters confidence that the platform is healthy. It covers dependency health, environment configuration warnings, and recent failures across actions, workflows, and agent threads.

## Accessing diagnostics

### API — GET /v1/runtime/health

Public, no auth required. Returns structured dependency statuses. Safe to poll from load balancers or uptime monitors.

```bash
curl http://localhost:3003/v1/runtime/health
```

Response shape:

```json
{
  "ok": true,
  "timestamp": "2026-04-16T12:00:00.000Z",
  "dependencies": [
    { "name": "database", "ok": true },
    { "name": "auth", "ok": true },
    { "name": "mcp", "ok": false, "message": "MCP_BOT_API_KEY not set — MCP auth disabled" }
  ]
}
```

`ok` is `true` only if all _critical_ dependencies pass. MCP and SSO are informational — they can fail without marking the system degraded.

### API — GET /v1/runtime/diagnostics

Requires `admin.surface` permission. Returns health + env warnings + recent failures.

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3003/v1/runtime/diagnostics
```

### Workshop — /diagnostics

Visible to admins in the sidebar under "Diagnostics". Shows:

- Dependency health with per-service status
- Environment warnings (missing required/recommended env vars)
- Last 10 failed actions, workflows, and agent threads

## Dependencies checked

| Name | Critical | Description |
|---|---|---|
| `database` | Yes | Simple `SELECT 1` ping |
| `auth` | Yes | `SESSION_SECRET` env var presence |
| `sso` | No (informational) | OIDC env vars consistency — only shown when any SSO var is set |
| `mcp` | No (informational) | `MCP_BOT_API_KEY` presence |
| `storage` | No (informational) | Only shown when `STORAGE_BUCKET` is set; checks credentials |

## Environment warnings

The health service checks for required and recommended env vars at startup and via the diagnostics endpoint. Severity levels:

| Severity | Meaning |
|---|---|
| `error` | Required for production — missing will cause failures |
| `warn` | Recommended — will work without but not safely |

Required env vars:

- `DATABASE_URL`
- `SESSION_SECRET`
- `INTERNAL_API_SECRET`

Recommended:

- `API_CORS_ORIGINS`
- `NEXT_PUBLIC_API_URL`

## Troubleshooting

**Database unreachable** — check `DATABASE_URL`, Postgres is running, and the DB schema is migrated (`pnpm db:migrate`).

**SESSION_SECRET not set** — generate a random secret: `openssl rand -hex 32`. Add to `.env.local`.

**SSO partially configured** — either set all three OIDC vars (`AUTH_OIDC_ISSUER`, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`) or none.

**MCP auth disabled** — set `MCP_BOT_API_KEY` if you want authenticated MCP access.

**Recent action failures** — click through to the action execution or approval in Workshop. Check the `error` field and `correlationId` to find correlated events in `/v1/activity/correlation/:id`.

**Recent workflow failures** — check the WorkflowRun record. Step-level failure detail is available via the workflow detail page in Workshop.
