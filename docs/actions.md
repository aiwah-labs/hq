# Actions

An **Action** is a scope-gated, typed operation exposed uniformly to the Workshop UI, REST API, MCP agents, and workflow engines. Actions are the single surface agents speak to.

## Two kinds of actions

1. **Auto-generated CRUD** — every registered object gets 8 actions for free:

   `<type>.list`, `<type>.count`, `<type>.get`, `<type>.create`, `<type>.update`, `<type>.delete`, `<type>.bulkUpdate`, `<type>.bulkDelete`

2. **Custom** — defined in [`shared/actions/src/custom/`](../shared/actions/src/custom) with [`defineAction`](../shared/actions/src/registry.ts).

## Defining a custom action

```ts
// shared/actions/src/custom/project/start-project.ts
import { z } from 'zod';
import { defineAction } from '../../registry.js';

export const startProject = defineAction({
  name: 'project.start',
  title: 'Start project',
  description: 'Transition a planned project to active and stamp startedAt.',
  category: 'custom',
  objects: { reads: ['Project'], writes: ['Project'] },
  scopes: ['project.write'],
  parameters: z.object({
    id: z.string().min(1),
    startedAt: z.string().datetime().optional(),
  }),
  handler: async ({ id, startedAt }, ctx) => {
    return ctx.db.project.update({
      where: { id },
      data: { status: 'active', startedAt: startedAt ? new Date(startedAt) : new Date() },
    });
  },
});
```

Action fields:

| Field | Purpose |
|---|---|
| `name` | Unique dotted identifier (e.g. `project.start`) |
| `title` | Human-readable label for UI/MCP |
| `description` | Used verbatim by MCP + admin UIs |
| `category` | `crud`, `custom`, or `integration` |
| `objects` | `{ reads, writes, deletes }` — object types this action touches (used for governance/discovery) |
| `resources` | Free-form resource identifiers for non-object effects (e.g. `'slack.message'`) |
| `scopes` | Bot scopes granted access to this action |
| `parameters` | Zod schema (auto-converted to JSON Schema for MCP) |
| `handler` | `async (params, ctx) => result` |

## Registering a custom action

Import the module for its side effect from [`shared/actions/src/index.ts`](../shared/actions/src/index.ts):

```ts
import './custom/project/start-project.js';
```

The action is registered via `defineAction` and appears in `registry.list()` immediately.

## Calling an action

### From the API

```http
POST /v1/actions/project.start
Content-Type: application/json
Authorization: Bearer <api-key>

{ "id": "proj_abc" }
```

Introspection:

- `GET /v1/actions` → list of all actions (name, title, description, category, scopes, objects)
- `GET /v1/actions/:name` → full details including JSON Schema parameters
- `GET /v1/actions/:name/schema` → JSON Schema parameters only (useful for LLMs)

### From MCP

Every action is exposed as an MCP tool with the JSON Schema generated from its Zod parameters. Clients discover tools via standard MCP discovery.

### Inside Workshop

Server actions in `apps/workshop/src/app/**/actions.ts` call handlers directly; the registry is the same underneath.

## Scope model

- Each action lists `scopes: string[]`. Principals with **any** of these granted gain access.
- Auto-generated CRUD actions use the object's declared scopes: `read` for list/count/get, `write` for create/update/bulkUpdate, `delete` (falling back to write) for delete/bulkDelete.
- Actions with no scope match are filtered out of `registry.resolve(principalScopes)` — agents never see tools they cannot call.

## Risk and approvals

Every action has a risk level: `low | medium | high`. Set it explicitly on the definition, or let the dispatcher infer from the action shape:

- `*.delete`, `*.bulkDelete`, `*.merge`, `*.archive`, `*.send` → **high**
- `*.create`, `*.update`, `*.bulkUpdate`, actions writing objects → **medium**
- read-only (`*.list`, `*.get`, `*.count`) → **low**

Declare explicit approval when an action must never run without a human reviewing it:

```ts
export const mergeCustomer = defineAction({
  name: 'customer.merge',
  scopes: ['customer.write'],
  risk: 'high',
  approval: {
    required: true,
    reason: 'Merging customers is destructive and irreversible.',
    bypassScopes: ['approvals.decide'],
  },
  // …
});
```

When the dispatcher hits a gated action:

1. Creates an `ActionApprovalRequest` row (status `PENDING`) plus an `ActionExecution` row (status `PENDING_APPROVAL`).
2. Returns `{ ok: true, pending: true, approvalRequestId, executionId, risk, reason }` from `dispatchAction`. The HTTP surface returns **202 Accepted**.
3. Callers holding any `bypassScopes` permission skip the gate and run immediately.

Approvers use:

- `GET /v1/approvals?status=PENDING` — queue
- `POST /v1/approvals/:id/approve` — runs the action via `dispatchAction(..., { skipApproval: true, approvedRequestId })`
- `POST /v1/approvals/:id/reject` — marks the request rejected and the linked execution `CANCELLED`
- `GET /v1/action-executions` — audit trail across every surface (HTTP, MCP, agent, workflow)

Permissions: `approvals.view` to read the queue, `approvals.decide` to approve/reject.

## Governance hints

`objects.reads/writes/deletes` and `resources` are non-enforcing metadata. They power:

- Admin dashboards that display "what can this bot touch?"
- MCP descriptions that surface side-effect blast radius to clients
- Future approval flows (Plan 6) that gate destructive actions before execution

## Serialization

`serializeAction(action)` returns a JSON-safe shape with parameters as JSON Schema. Used by:

- `/v1/actions/:name` and `/v1/actions` endpoints
- The MCP tool builder
- Workshop action previews

See [`shared/actions/src/schema.ts`](../shared/actions/src/schema.ts) for the Zod → JSON Schema converter.
