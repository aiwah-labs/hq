# Agents

Agents are AI coworkers. They live in [`shared/agents/`](../shared/agents) and speak to the rest of HQ **only** through the action layer — the same entry point used by the REST API, Workshop server actions, workflow nodes, and MCP.

That uniformity is what makes the template trustworthy: there is exactly one place where auth, validation, risk inference, approval gating, and audit logging happen, and every surface funnels through it.

## Shape of an agent

```ts
// shared/agents/src/agents/<area>/<name>.ts
import { defineAgent } from '../../registry.js';

export const opsAssistant = defineAgent({
  key: 'projects.ops-assistant',
  name: 'Projects Ops Assistant',
  description: 'Summarises project status, surfaces blockers, and drafts weekly digests.',
  skills: ['projects'],          // declared skills (bundles of actions)
  triggers: ['chat'],            // surfaces that can start a run
});
```

`skills` resolve to a list of **actions** the agent may call. Resolution happens at runtime through `resolveCapabilities()` — the agent itself never sees raw action names or schemas, only the ones its declared skills expose.

## Capability UI

Every agent exposes a capability profile in Workshop (`/agents/<key>`):

- **Reads** — object types the agent may list/get/count
- **Writes** — object types the agent may create/update
- **Deletes** — object types the agent may delete
- **Resources** — free-form side effects (e.g. `slack.message`, `email.send`)
- **Risk breakdown** — how many of the agent's tools are low/medium/high risk
- **Approvals** — which tools always require human approval before running

The capability profile is derived from `serializeAction()` output, so it cannot drift from what the dispatcher actually enforces.

## Tool execution

`buildToolMap()` in [`shared/agents/src/tools.ts`](../shared/agents/src/tools.ts) turns every resolved action into an AI SDK tool whose `execute` calls `dispatchAction`. That means:

- **Scope enforcement** — the agent's principal must hold a required permission or the call returns `FORBIDDEN`.
- **Approval gating** — calling a gated action returns a structured pending-approval payload to the model. The action does **not** execute.

```jsonc
// Structured result seen by the model:
{
  "status": "pending_approval",
  "approvalRequestId": "ckv…",
  "executionId": "ckv…",
  "risk": "high",
  "message": "Merging customers is destructive and irreversible."
}
```

The model is expected to inform the user that approval was requested and pause rather than retry.

- **Audit trail** — every call writes an `ActionExecution` row linked to the agent's run.

Agents cannot bypass governance by reaching into lower-level CRUD helpers: the tools registered on the AI SDK instance only expose action names the dispatcher knows how to enforce.

## Principals and scopes

Agents run as bot principals:

```ts
{
  kind: 'bot',
  botId: 'projects.ops-assistant',
  scopes: [/* union of scopes required by resolved actions */],
  permissions: /* permission map derived from the bot's role */,
}
```

Scopes are derived from the agent's declared skills — an agent never gains access to an action its skills did not include.

## Development

- Define agents in [`shared/agents/src/agents/<area>/`](../shared/agents/src/agents).
- Bundle actions into skills in [`shared/agents/src/skill-definitions/`](../shared/agents/src/skill-definitions).
- Agents are registered by importing the module for its side effect from [`shared/agents/src/index.ts`](../shared/agents/src/index.ts).
- Runs happen through the runner in [`shared/agents/src/runner.ts`](../shared/agents/src/runner.ts); threads, steps, and tool calls are persisted.

See [`docs/actions.md`](./actions.md) for how to define the actions an agent calls, and [`docs/mcp.md`](./mcp.md) for how to expose them to external MCP clients.
