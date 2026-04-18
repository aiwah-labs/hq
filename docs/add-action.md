# Add an action

An **action** is a scope-gated, typed operation. Anything that writes — a UI
button, a workflow step, an agent tool, an MCP call — goes through the action
dispatcher. Define it once; every surface picks it up.

Full reference: [`actions.md`](actions.md). This page is the quickstart.

## You get 8 CRUD actions per object for free

Every registered object gets `<type>.list`, `.count`, `.get`, `.create`,
`.update`, `.delete`, `.bulkUpdate`, `.bulkDelete`. Check there first — most
"I need an action to do X" is already covered.

You only write a custom action when the operation is **not** trivial CRUD:
state transitions, side effects, cross-object work, or external API calls.

## Steps

### 1. Define the action

Create [`shared/actions/src/custom/invoices/mark-paid.ts`](../shared/actions/src/custom/):

```ts
import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'invoice.markPaid',
  title: 'Mark invoice paid',
  description: 'Transition a sent invoice to paid and stamp paidAt.',
  category: 'custom',
  objects: { reads: ['Invoice'], writes: ['Invoice'] },
  scopes: ['invoice.write'],
  parameters: z.object({
    id: z.string().min(1),
    paidAt: z.string().datetime().optional(),
  }),
  handler: async ({ id, paidAt }, ctx) => {
    const invoice = await ctx.db.invoice.findUniqueOrThrow({ where: { id } });
    if (invoice.status !== 'sent') {
      throw new Error(`Only sent invoices can be marked paid (was ${invoice.status})`);
    }
    return ctx.db.invoice.update({
      where: { id },
      data: { status: 'paid', paidAt: paidAt ? new Date(paidAt) : new Date() },
    });
  },
});
```

### 2. Register it at import time

Create an index file in your custom folder and add one line to
[`shared/actions/src/index.ts`](../shared/actions/src/index.ts):

```ts
// shared/actions/src/custom/invoices/index.ts
import './mark-paid.js';

// shared/actions/src/index.ts
import './custom/invoices/index.js';   // ← new
```

Actions register as a **side effect** — they don't need to be called or
exported. The dispatcher finds them by name.

### 3. Test it

```ts
// shared/actions/src/__tests__/invoices.test.ts
import { describe, it, expect, vi } from 'vitest';
import { dispatchAction } from '../dispatch.js';
import '../custom/invoices/index.js';

const ctx = {
  actor: { kind: 'user', userId: 'u1', permissions: new Set(['invoice.write']) },
  db: { invoice: {
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'i1', status: 'sent' }),
    update: vi.fn().mockResolvedValue({ id: 'i1', status: 'paid' }),
  } },
  now: () => new Date('2026-04-18'),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
};

describe('invoice.markPaid', () => {
  it('transitions a sent invoice to paid', async () => {
    const res = await dispatchAction(ctx as never, 'invoice.markPaid', { id: 'i1' });
    expect(res.status).toBe('ok');
    expect(ctx.db.invoice.update).toHaveBeenCalled();
  });

  it('rejects a draft invoice', async () => {
    (ctx.db.invoice.findUniqueOrThrow as any).mockResolvedValueOnce({ id: 'i1', status: 'draft' });
    const res = await dispatchAction(ctx as never, 'invoice.markPaid', { id: 'i1' });
    expect(res.status).toBe('error');
  });
});
```

### 4. Use it

- **Workshop:** appears in `/objects/Invoice/:id` action menu. No code.
- **API:** `POST /v1/actions/invoice.markPaid` with the Zod-validated body.
- **MCP:** tool `invoice_markPaid` with the Zod schema → JSON Schema conversion.
- **Workflow step:** `{ type: 'action', actionName: 'invoice.markPaid', inputMap: { id: 'trigger.invoiceId' } }`.
- **Agent tool:** if the agent has `invoice.write` scope (or a skill that includes it), the runner offers it automatically.

## Decision tree

- **Modifies exactly one field on one object?** → Use the generated
  `<type>.update` action with a partial payload. No custom action needed.
- **Requires a guard (state machine, side effect, cross-object mutation)?** →
  Write a custom action.
- **External API call (Shopify, Stripe, Slack)?** → Write a custom action that
  pulls credentials from `shared/integrations` — never hardcode keys.
- **High-risk and needs human sign-off?** → Add `approval: { required: true }`
  and set `risk: 'high'`. The dispatcher returns 202 + pending-approval
  payload; the approval queue in Workshop decides.

## Conventions

- **Dotted names, singular type:** `invoice.markPaid`, not `invoices.markPaid`.
- **Handler returns the post-state object** when it mutates — callers expect it.
- **Throw `Error` with a clear message** for business-rule violations. The
  dispatcher maps it to a 400. Use explicit status codes only at the API
  boundary.
- **Never call Prisma directly from a route handler.** Routes call
  `dispatchAction` so policy + validation + audit fire once.

## Next

- Chain this action into a multi-step flow → [add-workflow](add-workflow.md)
- Give an AI agent access to it → [add-agent](add-agent.md)
- Require manual sign-off → [`actions.md`](actions.md#risk-and-approval)
