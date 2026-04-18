# Events

HQ emits a `PlatformEvent` row for every significant mutation — object CRUD,
action dispatch, workflow step, agent turn, approval decision, file upload.
Events are the backbone of the activity timeline, the inbox, the diagnostics
surface, and any enrichment you want to bolt on.

## The mental model

| In code                                 | In the DB                          |
| --------------------------------------- | ---------------------------------- |
| `emitEvent(ctx, 'invoice.created', …)`  | row in `platform_events`           |
| `pg_notify('platform_events', …)`       | push to streaming subscribers      |
| `onEvent('invoice.created', handler)`   | application-level subscriber       |

The emitter is dead simple: one Postgres insert + one `pg_notify`. Subscribers
are regular code — listen on the `platform_events` channel (SSE, background
worker, test) or read rows directly when you need history.

## Open catalog

There is **no central enum** of event names. Event names are plain strings
chosen by the emitter:

- Object CRUD emits `<type>.created / .updated / .deleted / .bulk_deleted`.
- Custom actions can emit additional domain events (`invoice.paid`,
  `project.started`) in their handlers.
- File / folder / workflow / agent lifecycle events are emitted from their
  own service modules.

**Why no enum?** Because the cost of adding a new event should be zero.
Emit a string, land it. If you need a catalog for a particular module,
collect the strings in that module — not in a shared header that every
downstream consumer has to rebuild against.

## What gets emitted today

| Event                              | Emitted from                                          |
| ---------------------------------- | ----------------------------------------------------- |
| `<type>.created`                   | `shared/objects/src/crud.ts` (auto-generated)         |
| `<type>.updated`                   | same — also fired by `bulkUpdate` per-row             |
| `<type>.deleted`                   | same                                                  |
| `<type>.bulk_deleted`              | same — one event per bulk op                          |
| `action.started`                   | `shared/actions/src/dispatch.ts`                      |
| `action.completed`                 | same                                                  |
| `action.failed`                    | same                                                  |
| `action.approval_requested`        | same — when an action hits the approval gate          |
| `workflow.run.started`             | `shared/workflows/src/executor.ts`                    |
| `workflow.run.completed`           | same                                                  |
| `workflow.run.failed`              | same                                                  |
| `workflow.step.failed`             | same                                                  |
| `agent.turn.started`               | `shared/agents/src/runner.ts`                         |
| `agent.turn.completed`             | same                                                  |
| `agent.turn.failed`                | same                                                  |
| `folder.created` / `.updated` / `.deleted` | `shared/files/src/folders.ts`                 |
| `file.created` / `.moved` / `.updated` / `.deleted` | `shared/files/src/files.ts`          |

## Calling `emitEvent`

```ts
import { emitEvent } from '@hq/events';

await emitEvent(ctx, 'invoice.paid', {
  objectType: 'Invoice',
  objectId: invoice.id,
  payload: {
    amount: invoice.amount,
    paidAt: invoice.paidAt,
    source: 'stripe',
  },
});
```

Fields that shape the activity timeline:

| Field             | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `objectType` + `objectId` | Link the event to an object's detail timeline |
| `actionName`      | Link to `/actions/:name` detail                      |
| `workflowRunId`   | Link to a workflow run                               |
| `agentRunId`      | Link to an agent run                                 |
| `approvalRequestId` | Link to the approval queue item                    |
| `correlationId`   | Group events from the same user-initiated operation  |
| `payload`         | Free-form — keep it small, stable, and non-sensitive |

All fields are optional. `actor` is derived from the service context.

## Subscribing

### Application-level (in-process)

Write a listener once at startup using [`subscribe`](../shared/events/src/router.ts):

```ts
import { subscribe } from '@hq/events/router';

subscribe(
  'file.created',                                      // exact match — use 'file.*' for a prefix
  async (event) => {
    if (event.objectType !== 'File' || !event.objectId) return;
    await enqueueThumbnail(event.objectId);
  },
  { source: 'thumbnail-worker' },
);
```

Handlers receive a `PlatformEventNotification` — id, type, objectType,
objectId, correlationId. For the full payload, read the `PlatformEvent`
row by id. Handlers run concurrently; errors are logged and swallowed so one
bad handler doesn't break the rest. For anything more than a quick dispatch,
hand off to a background job (`@hq/jobs`) rather than block the emitter.

### Streaming (out-of-process)

Subscribe to the `platform_events` Postgres channel. The Workshop activity
timeline and the diagnostics feed both use this path — the payload is small
(id, type, objectType, objectId, correlationId); pull the full row from
`platform_events` if you need the payload.

## Conventions

- **Dotted names, lowercase.** `invoice.paid`, not `InvoicePaid`.
- **Fire events from service code, not routes.** Routes shouldn't know there
  is an audit trail — the service layer owns that contract.
- **Emit after commit.** Use the dbClient's implicit transaction boundary so
  you don't emit an event for a row that was rolled back.
- **Keep payloads small and stable.** Payloads land in the audit log and
  feed the inbox; avoid PII you wouldn't want to keep forever.
- **Never let emit failures break the write.** The helper already swallows
  errors with a console warning — don't wrap it in your own try/catch.

## Code map

| Concern         | Module                                          |
| --------------- | ----------------------------------------------- |
| Emitter         | [`shared/events/src/emit.ts`](../shared/events/src/emit.ts) |
| In-process bus  | [`shared/events/src/router.ts`](../shared/events/src/router.ts) |
| Schema          | `PlatformEvent` in [`shared/db/prisma/schema.prisma`](../shared/db/prisma/schema.prisma) |
| Activity feed   | Workshop `/activity` route + object-detail timelines |
