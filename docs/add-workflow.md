# Add a workflow

A **workflow** is a deterministic, multi-step flow — a sequence of action
calls, function steps, and conditionals with a trigger (manual, cron, event,
or webhook). Workflows are the right home for "when X happens, do Y then Z"
logic.

Full reference: [`agents.md`](agents.md) (workflows section). This page is the
quickstart.

## When to use a workflow vs an action vs an agent

| Problem                                               | Use        |
| ----------------------------------------------------- | ---------- |
| Single typed operation                                | Action     |
| Chain of typed operations with explicit control flow  | Workflow   |
| Needs LLM judgment ("which invoices to flag?")        | Agent      |
| Scheduled + fully deterministic                       | Workflow   |
| Fires on an event with a branching response           | Workflow   |

If you find yourself reaching for an agent to do something that's a fixed
recipe of action calls, prefer a workflow. Workflows are cheaper, faster,
reproducible, and can be reviewed like code.

## Steps

### 1. Define the workflow

Create [`shared/workflows/src/workflows/invoices/collect-overdue.ts`](../shared/workflows/src/workflows/):

```ts
import { defineWorkflow } from '../../registry.js';
import type { WorkflowExecutionContext, StepEval } from '../../types.js';

defineWorkflow({
  key: 'invoices.collect-overdue',
  name: 'Collect overdue invoices',
  description: 'Every weekday, find overdue invoices and send reminders.',
  version: 1,
  category: 'ops',
  tags: ['billing', 'reminders'],

  triggers: [
    { type: 'manual' },
    { type: 'cron', cronExpression: '0 10 * * 1-5' }, // 10am Mon–Fri
  ],

  annotation: {
    icon: 'receipt',
    color: '#d97706',
    estimatedDurationMs: 10_000,
  },

  entryNodeId: 'find-overdue',

  nodes: [
    {
      id: 'find-overdue',
      type: 'action',
      actionName: 'invoice.list',
      inputMap: {
        where: { status: 'sent', dueDate: { lt: '{{now}}' } },
        limit: 100,
      },
    },
    {
      id: 'send-reminder',
      type: 'action',
      actionName: 'invoice.sendReminder',  // custom action you defined
      inputMap: {
        id: '{{steps.find-overdue.output.items[*].id}}',
      },
      forEach: { source: 'steps.find-overdue.output.items', as: 'item' },
    },
    {
      id: 'log-result',
      type: 'function',
      handler: async (_input, ctx: WorkflowExecutionContext) => {
        const invoices = ctx.steps['find-overdue']?.output as { items: unknown[] };
        return { remindersSent: invoices.items.length };
      },
    },
  ],

  edges: [
    { from: 'find-overdue',  to: 'send-reminder' },
    { from: 'send-reminder', to: 'log-result' },
  ],

  evals: {
    'log-result': async (_in, out): Promise<StepEval[]> => {
      const r = out as { remindersSent: number };
      return [{ name: 'sent_reminders', passed: r.remindersSent >= 0, score: 1 }];
    },
  },
});
```

### 2. Register at import time

Add one line to [`shared/workflows/src/workflows/index.ts`](../shared/workflows/src/workflows/index.ts):

```ts
import './invoices/collect-overdue.js';
```

### 3. Test it

Unit-test the function steps directly (they're just functions). For the full
flow, use the existing test harness in
[`shared/workflows/src/__tests__/`](../shared/workflows/src/__tests__/) —
mock the action dispatcher and walk the graph.

### 4. Use it

- **Manual run:** Workshop → `/workflows` → run with inputs.
- **Cron:** the scheduler in `shared/jobs` picks up the cron trigger on
  startup and enqueues runs on the configured schedule.
- **API:** `POST /v1/workflows/invoices.collect-overdue/run` with an
  input payload. Response is an execution id you can poll or stream.
- **From an agent:** if the agent has a skill that includes workflow execution
  scope, it can trigger this as a tool.

## Node types

| Type        | Purpose                                                    |
| ----------- | ---------------------------------------------------------- |
| `action`    | Call a registered action with `inputMap` and (optionally) `forEach` |
| `function`  | Inline async handler — use sparingly, prefer actions      |
| `condition` | Branch on an expression evaluated against step outputs    |
| `workflow`  | Invoke another workflow as a subroutine                   |
| `agent`     | Hand off to an agent with scoped tools                    |

## Expressions

Inputs use `{{...}}` templates over a small, typed expression language.
Available roots: `input`, `steps.<id>.output`, `now`, `actor`. Lists support
`[*]` and `[?(predicate)]` for simple projection. Full reference in
[`shared/workflows/src/expression.ts`](../shared/workflows/src/expression.ts).

## Triggers

- `manual` — Workshop run button / API endpoint
- `cron` — fixed schedule (UTC by default)
- `event` — subscribe to a specific event name (e.g. `'invoice.created'`)
- `webhook` — HTTP endpoint that enqueues a run with the request body

## Conventions

- **Idempotent steps when possible.** Workflow retries replay from the last
  failed node; idempotent actions make retries safe.
- **Keep function steps short.** Anything that's a real operation should be
  an action. Function steps are glue.
- **Set `evals`** for observability. Even a single boolean check per run
  turns your activity timeline into something worth looking at.

## Next

- Spawn an LLM agent mid-flow → add an `agent` node and define the agent in [add-agent](add-agent.md).
- Fire on an event → set `triggers: [{ type: 'event', eventName: 'invoice.created' }]`.
- Gate a risky step → the dispatcher handles approval automatically if the
  action is marked `approval.required`.
