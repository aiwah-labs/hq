# Workflows

A **workflow** is a deterministic directed graph of action calls, agent
handoffs, conditionals, and delays. Workflows are the right home for "when X
happens, do Y then Z" logic — anywhere an operator would otherwise string
actions together by hand.

For the "how do I add one?" quickstart see [`add-workflow.md`](add-workflow.md).
This page is the reference.

## When to reach for a workflow

| Problem                                               | Use        |
| ----------------------------------------------------- | ---------- |
| Single typed operation                                | Action     |
| Chain of typed operations with explicit control flow  | Workflow   |
| Needs LLM judgment ("which invoices to flag?")        | Agent      |
| Scheduled + fully deterministic                       | Workflow   |
| Fires on an event with a branching response           | Workflow   |

Workflows are cheaper, faster, and more auditable than agents. Prefer them
whenever the logic is a fixed recipe.

## Anatomy

```ts
defineWorkflow({
  key: 'invoices.collect-overdue',
  name: 'Collect overdue invoices',
  version: 1,
  category: 'ops',
  triggers: [ ... ],     // manual, cron, event, webhook
  entryNodeId: 'find',
  nodes: [ ... ],        // graph nodes
  edges: [ ... ],        // directed edges between nodes
  evals: { ... },        // optional per-step quality checks
});
```

Workflows register as a **side effect** — an `import` line in
[`shared/workflows/src/workflows/index.ts`](../shared/workflows/src/workflows/index.ts)
is enough. The registry picks them up at boot; triggers schedule themselves;
the executor runs them.

## Node types

| Type         | What it does                                                              |
| ------------ | ------------------------------------------------------------------------- |
| `action`     | Call a registered action with `inputMap` (and optional `forEach`)         |
| `agent`      | Hand off to an agent with a prompt and a scoped tool list                 |
| `function`   | Inline async handler — use sparingly, prefer actions                      |
| `condition`  | Branch on an expression evaluated against step outputs                    |
| `delay`      | Sleep for `delayMs` before firing the next node                           |
| `loop`       | Repeat a sub-graph until a condition is met                               |
| `parallel`   | Fan out to multiple next nodes and wait for all                           |
| `subworkflow` | Invoke another workflow as a subroutine                                  |
| `wait`       | Suspend until an external event (approval, webhook) resolves the run     |

Every node definition accepts `retryPolicy`, `onError` (`fail` / `skip` /
`continue`), `timeoutMs`, and an `annotation` (label + description for the
graph UI).

## Triggers

| Trigger type | Fires when                                                                    |
| ------------ | ----------------------------------------------------------------------------- |
| `manual`     | A user clicks "Run" in Workshop or calls the run API                          |
| `cron`       | The scheduler (from `@hq/jobs`) enqueues the cron expression                  |
| `event`      | A matching `PlatformEvent` is emitted (e.g. `invoice.created`)                |
| `webhook`    | An authenticated POST hits the workflow's webhook endpoint                    |

A single workflow can declare multiple triggers. Triggers register with
[`@hq/jobs`](../shared/jobs/src/) at boot; removing a trigger from the code
removes it from the scheduler on the next restart.

## Expressions

`inputMap` values use `{{...}}` templates over a small typed expression
language. Available roots:

- `input` — the run input (manual runs, webhook bodies, event payloads)
- `steps.<id>.output` — any prior step's output
- `now` — current timestamp (ISO string)
- `actor` — the principal running the workflow
- `item` — inside a `forEach`, the current iteration value

Lists support `[*]` projection and `[?(predicate)]` filtering. Full grammar
and operator list in [`shared/workflows/src/expression.ts`](../shared/workflows/src/expression.ts).

## Evals

Every workflow can ship optional evaluators keyed by node id:

```ts
evals: {
  'send-reminder': async (input, output) => [{
    name: 'reminders_sent',
    passed: (output as any).remindersSent >= 0,
    score: 1,
    detail: `Sent ${(output as any).remindersSent} reminders`,
  }],
}
```

Evals run after the step completes and are written to the run's execution
record. The activity timeline surfaces failed evals so regressions are visible
without writing a separate test harness.

## Execution model

- **Each run is a graph walk.** The executor starts at `entryNodeId`,
  evaluates node handlers, and follows outgoing edges. Edge conditions
  can filter paths ("only follow this edge if step X returned N items").
- **Step outputs are immutable.** Downstream nodes read via
  `steps.<id>.output`; the executor never mutates prior outputs.
- **Failures are per-node.** With default `onError: 'fail'`, a failure
  aborts the run and fires `workflow.run.failed`. With `skip` or `continue`
  the run keeps going; the audit trail records the failure either way.
- **Retries use `retryPolicy`.** The executor re-runs the node with
  exponential or linear backoff up to `maxAttempts`.
- **Approvals suspend the run.** If a workflow step calls an action gated
  by `approval.required: true`, the step returns pending and the run parks
  in a waiting state until the approval queue resolves.

## Persistence

Every run writes a `WorkflowRun` row + `WorkflowStepExecution` rows per
node. Re-running a workflow produces a new run; there's no in-place
mutation of the history. The persistence layer lives in
[`shared/workflows/src/persistence.ts`](../shared/workflows/src/persistence.ts).

## Events

| Event                      | When                                    |
| -------------------------- | --------------------------------------- |
| `workflow.run.started`     | Executor starts a new run               |
| `workflow.run.completed`   | Run finishes successfully               |
| `workflow.run.failed`      | Run aborts (unhandled error)            |
| `workflow.step.failed`     | A step fails (may or may not abort the run) |

Subscribe in [`@hq/events/router`](../shared/events/src/router.ts) to wire
notifications, external dashboards, or post-run hooks.

## Running workflows

- **Workshop UI:** `/workflows` — pick a workflow, supply input, run.
- **API:** `POST /v1/workflows/:key/run` with a JSON body. Response is a run
  id you can poll (`GET /v1/workflow-runs/:id`) or stream.
- **Cron / event:** automatic — the scheduler handles both.
- **Webhook:** `POST /v1/workflows/:key/webhook` with the configured auth.

## Conventions

- **Idempotent steps when possible.** A retried step should land the system
  in the same state; this keeps the retry policy safe to use by default.
- **Keep function steps short.** Anything that's a real operation should be
  an action (auto-registered, testable, scope-gated). Function steps are
  glue that doesn't need its own surface.
- **Name nodes as verbs.** `'find-overdue'`, `'send-reminder'` — the graph
  reads as a to-do list when nodes are named that way.
- **Set at least one eval per run.** A single pass/fail boolean turns the
  activity timeline into an early regression warning.

## Code map

| Concern         | Module                                          |
| --------------- | ----------------------------------------------- |
| Registry        | [`shared/workflows/src/registry.ts`](../shared/workflows/src/registry.ts) |
| Types           | [`shared/workflows/src/types.ts`](../shared/workflows/src/types.ts) |
| Executor        | [`shared/workflows/src/executor.ts`](../shared/workflows/src/executor.ts) |
| Expressions     | [`shared/workflows/src/expression.ts`](../shared/workflows/src/expression.ts) |
| Persistence     | [`shared/workflows/src/persistence.ts`](../shared/workflows/src/persistence.ts) |
| Example flows   | [`shared/workflows/src/workflows/`](../shared/workflows/src/workflows/) |
| Scheduler glue  | [`shared/jobs/`](../shared/jobs/src/)           |
