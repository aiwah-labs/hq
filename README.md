# HQ

**A serious agentic internal platform — clone it and make it yours.**

HQ is a production-ready template for building self-hosted operational infrastructure. It ships with identity, permissions, a registry-driven object/action system, agent governance, MCP, activity timelines, diagnostics, and two example modules you can replace with your own domain. Your data stays in your database. Your logic lives in your codebase.

```bash
git clone https://github.com/aiwah-labs/hq
cd hq
pnpm install
pnpm db:local:bootstrap
pnpm dev:platform
```

Workshop runs at **http://localhost:3002** · API at **http://localhost:3003**

Default login: `admin@example.com` / `password`

---

## What HQ is

A template. Not a SaaS. Not a no-code tool.

You fork it, load it into a coding agent, and shape it to your business. The platform takes care of the hard infrastructure so you spend time on your domain, not on rebuilding auth, permissions, and action routing.

## What HQ is not

HQ is not a finished product. It is not a no-code builder. It has no plugin marketplace. You are expected to write code to add your objects, actions, and workflows.

---

## Local setup

Prerequisites: **Node.js 22+**, **pnpm 10+**, **Docker** (for Postgres)

```bash
# 1. Clone
git clone https://github.com/aiwah-labs/hq
cd hq

# 2. Install
pnpm install

# 3. Bootstrap local Postgres (starts container, migrates, seeds)
pnpm db:local:bootstrap

# 4. Start Workshop + API
pnpm dev:platform

# 5. Check your setup
pnpm doctor
```

Log in at http://localhost:3002 with `admin@example.com` / `password`.

---

## First things to try

**Explore the example modules:**
- `/objects` — Object Studio: browse the CRM (Customer, Product) and Projects/Tasks modules
- `/projects` — project overview, portfolio, and blocked-tasks view
- `/agents` — see the registered agents and what actions they can use
- `/approvals` — governance queue for high-risk actions

**Connect MCP:**

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "hq": {
      "command": "node",
      "args": ["/path/to/hq/apps/mcp/dist/server.js"],
      "env": { "MCP_BOT_API_KEY": "your-key" }
    }
  }
}
```

Or run locally: `pnpm mcp`

**Replace the example module:**

Projects and Tasks are a working but removable example. See [`docs/example-modules/projects.md`](./docs/example-modules/projects.md) for the removal checklist and [`docs/example-modules/README.md`](./docs/example-modules/README.md) to build your own.

---

## Architecture

```
Objects ──────────────── Define your entities (registry-driven CRUD + schema)
Actions ──────────────── Universal execution layer (auth, approval, audit, MCP)
Workflows ────────────── Deterministic chains: actions, agents, conditions, loops
Agents ───────────────── AI actors with tool access + approval awareness
Events ───────────────── Activity timeline: every mutation, action, workflow, agent run
Permissions ──────────── Unified policy engine: users, bots, agents, objects, actions
Identity ─────────────── Local auth + SSO/OIDC extension path
MCP ──────────────────── External agent access to all actions
Workshop ─────────────── Admin UI: objects, projects, approvals, diagnostics
```

Deep-dives: [`docs/objects.md`](./docs/objects.md) · [`docs/actions.md`](./docs/actions.md) · [`docs/agents.md`](./docs/agents.md) · [`docs/permissions.md`](./docs/permissions.md) · [`docs/mcp.md`](./docs/mcp.md)

---

## Adding your own domain

See the builder guides:

- [`docs/add-object.md`](./docs/add-object.md) — add a new object type
- [`docs/add-action.md`](./docs/add-action.md) — add a custom action
- [`docs/add-workflow.md`](./docs/add-workflow.md) — add a workflow
- [`docs/add-agent.md`](./docs/add-agent.md) — add an agent
- [`docs/example-modules/README.md`](./docs/example-modules/README.md) — build a full module

---

## Production deployment

See [DEPLOY.md](./DEPLOY.md) for the full guide.

```bash
# On a fresh Ubuntu VPS
curl -fsSL https://raw.githubusercontent.com/aiwah-labs/hq/main/scripts/setup-server.sh | bash
git clone https://github.com/aiwah-labs/hq /opt/hq
cd /opt/hq && cp .env.example .env.prod
# edit .env.prod — set DATABASE_URL, SESSION_SECRET, INTERNAL_API_SECRET
bash scripts/first-deploy.sh
bash scripts/setup-nginx.sh your-domain.com
```

---

MIT License · Built by [Aiwah Labs](https://aiwahlabs.com)
