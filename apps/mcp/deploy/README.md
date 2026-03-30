# MCP Runtime

MCP currently runs with stdio transport for Claude Desktop style local integration.

## Env
Use `apps/mcp/deploy/.env.example` and set:
- `MCP_API_BASE_URL`
- `MCP_BOT_API_KEY`

## Start
```bash
pnpm --filter @hq/mcp start
```
