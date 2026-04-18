# MCP

HQ ships with a stdio MCP server ([`apps/mcp`](../apps/mcp)) that exposes every registered action as a tool with a real JSON schema. Connect Claude Desktop, Cursor, Zed, or any MCP-compatible client and your agents speak to HQ through the exact same dispatcher the REST API uses.

## What gets exposed

Every action in `actionRegistry.list()` becomes an MCP tool:

- **Name** — `company.list` (or `company_list` for clients that don't accept dots).
- **Description** — the action's `description`, with `[risk: low|medium|high]` and `[approval required]` tags appended.
- **Input schema** — the full JSON Schema derived from the action's Zod parameters.
- **Execution** — routed through `dispatchAction` so scopes, risk inference, approval gating, and audit logging all apply.

High-risk actions return a structured pending-approval payload instead of executing:

```jsonc
{
  "status": "pending_approval",
  "approvalRequestId": "ckv…",
  "executionId": "ckv…",
  "risk": "high",
  "reason": "Merging customers is destructive and irreversible."
}
```

## Setting up a client

1. Create a bot and an API key (Workshop → Bots, or `POST /v1/bots` + `POST /v1/bots/:id/keys`).
2. Copy the raw key (shown once at creation).
3. Add the server to your client's MCP config. See [`.mcp.json.example`](../.mcp.json.example).

```jsonc
// ~/.claude/mcp.json (Claude Desktop)
{
  "mcpServers": {
    "hq": {
      "command": "pnpm",
      "args": ["--filter", "@hq/mcp", "dev"],
      "cwd": "/absolute/path/to/hq",
      "env": {
        "MCP_BOT_API_KEY": "hq_sk_…",
        "DATABASE_URL": "postgresql://hq:hq@localhost:5433/hq"
      }
    }
  }
}
```

Without `MCP_BOT_API_KEY` the server lists tools but rejects `tools/call` with `UNAUTHENTICATED`. This is intentional — it lets you introspect tool schemas without granting execute permission.

## Tool name mapping

Some MCP clients reject dots in tool names. The server publishes every action under its underscored alias (`company.list` → `company_list`) and accepts either form on `tools/call`.

## Scopes

The tools a client can actually execute are the intersection of:

- every action in the registry, and
- every permission the bot's API key grants.

Read-only bot scopes (e.g. `customer.read`) see the list/get/count actions but get `FORBIDDEN` on create/update/delete.

## Approval flow from MCP

1. The client calls `customer.merge` via `tools/call`.
2. The dispatcher records an approval request and returns the pending payload.
3. A reviewer approves via Workshop or `POST /v1/approvals/:id/approve`.
4. The approve endpoint re-runs the action via `dispatchAction(..., { skipApproval: true, approvedRequestId })`.
5. The execution row promotes `PENDING_APPROVAL → COMPLETED` with the linked `approvalRequestId`.

The MCP client never needs to re-issue the call — the approval path runs the action for it.

## See also

- [`docs/actions.md`](./actions.md) — action definition, risk, approval metadata
- [`docs/agents.md`](./agents.md) — how agents use the same dispatcher
- [`docs/permissions.md`](./permissions.md) — scope and permission model
