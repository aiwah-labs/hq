# Building with HQ

HQ is a template you shape to your business. You fork the repo, wire in your
data model, and ship — the platform takes care of auth, permissions, actions,
agents, MCP, and observability.

This page is the map. The `docs/add-*.md` quickstarts walk you through each
moving part one at a time.

## The five registries

Everything in HQ lives in one of five registries. Add your entry, restart the
server, and the whole stack — Workshop UI, REST API, MCP, agents, workflows —
sees it.

| Registry     | What you register             | Where it lives                                              | Quickstart |
| ------------ | ----------------------------- | ----------------------------------------------------------- | ---------- |
| **Objects**  | Business entities             | [`shared/objects/src/modules/`](../shared/objects/src/modules/) | [add-object](add-object.md) |
| **Actions**  | Typed operations              | [`shared/actions/src/custom/`](../shared/actions/src/custom/)   | [add-action](add-action.md) |
| **Workflows** | Deterministic multi-step flows | [`shared/workflows/src/workflows/`](../shared/workflows/src/workflows/) | [add-workflow](add-workflow.md) |
| **Agents**   | AI actors with tool access    | [`shared/agents/src/agents/`](../shared/agents/src/agents/)     | [add-agent](add-agent.md) |
| **Integrations** | External providers         | [`shared/integrations/src/providers/`](../shared/integrations/src/providers/) | [integrations](integrations.md) |

## The architecture in one picture

```
Objects ──► registered Prisma models + field metadata
   │
   │  auto-generates 8 CRUD actions per object
   ▼
Actions ──► unified execution surface (auth, validation, approval, audit)
   │                │                 │
   ▼                ▼                 ▼
 Workshop UI     REST API           MCP server
                    │                 │
                    ▼                 ▼
                Workflows ◄─────── Agents (tool access)
                    │                 │
                    └────► Events ◄───┘
                             │
                             ▼
                  Activity timeline · Inbox · Audit
```

Any code path that wants to read or write — Workshop button, REST endpoint,
workflow step, agent tool call, MCP tool — goes through the action dispatcher.
Policy, validation, and audit are applied in exactly one place.

## The code map

```
apps/
  api/        REST + MCP router — thin; routes delegate to services
  workshop/   Next.js admin UI — reads from shared libraries directly
  mcp/        MCP stdio server — wraps the action dispatcher

shared/
  db/         Prisma schema + migrations + seeds
  auth/       Principals, policy engine, session + OIDC
  objects/    Registry, CRUD, field types, derive schemas from Prisma
  actions/    Registry, dispatcher, per-action policy + audit
  workflows/  Registry, types, execution engine
  agents/     Registry, runner, skills, tools
  events/     pg_notify fan-out, activity timeline
  jobs/       pg-boss workers + scheduling
  files/      Folder + FileObject services, upload handshake
  storage/    Pluggable storage drivers (local, S3)
  integrations/ OAuth + static credentials + per-connection ACL
  services/   Cross-cutting service context, inbox, notes
  messaging/  Provider-agnostic messaging (Slack, email, …)
```

## Starter paths

- **"I want to add a business entity"** → [add-object](add-object.md)
- **"I want agents to be able to do X"** → [add-action](add-action.md)
- **"I want a scheduled multi-step flow"** → [add-workflow](add-workflow.md)
- **"I want an AI assistant that can use my actions"** → [add-agent](add-agent.md)
- **"I want to call a third-party API"** → [integrations](integrations.md)
- **"I want to replace the CRM example entirely"** → [example-modules](example-modules/README.md)

## Conventions that keep the surface small

- **No route code for CRUD.** Register an object; list/detail/form/API appear.
  Only write routes for views that aren't "look at rows of one object."
- **Actions are the only write surface.** UI buttons, agent tools, workflow
  steps, and MCP calls all funnel through the dispatcher.
- **Policy lives on the definition, not on the caller.** `scopes`,
  `ownership`, and `approval` ride on the object/action definition.
- **Events are pg_notify + strings.** No central catalog. Subscribers wire in
  as plain listeners — never patch service functions.
- **Modules are folders, not plugins.** Drop a file in
  `shared/objects/src/modules/`, spread it into the index. Same pattern for
  actions, workflows, agents.

## Templates

Minimal skeletons for each registry live in [`templates/`](../templates/).
Each file is a runnable starting point — copy, rename, edit, import.

- [`templates/object.ts`](../templates/object.ts)
- [`templates/action.ts`](../templates/action.ts)
- [`templates/workflow.ts`](../templates/workflow.ts)
- [`templates/agent.ts`](../templates/agent.ts)
- [`templates/module/`](../templates/module/) — a minimal full module (objects + seed + actions)
