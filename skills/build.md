# Building on HQ

## Development environment

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 15+

### Setup

```bash
git clone https://github.com/aiwah-labs/hq
cd hq
pnpm install
cp .env.example .env
# Edit .env with your database URL
pnpm db:local:bootstrap
pnpm dev:platform
```

Load the repo into a coding agent — Claude Code, Cursor, or Codex — and describe what your business needs. The platform is designed to be extended through conversation with an AI.

## Adding an object

An object is any entity your business cares about — a customer, a booking, a job, a property.

1. Add the Prisma model to `shared/db/prisma/schema.prisma`
2. Register it in `shared/objects/src/registry.ts` with its fields, scopes, and labels
3. Run `pnpm db:migrate`

The object now has a full API, Workshop UI, and MCP tool surface automatically. No extra code needed.

## Adding a custom action

Create a file in `shared/actions/src/custom/` and use `defineAction()`:

```typescript
import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'booking.confirm',
  description: 'Confirm a booking and notify the customer',
  category: 'custom',
  scopes: ['booking.write'],
  parameters: z.object({ bookingId: z.string() }),
  handler: async (params, ctx) => {
    return ctx.db.booking.update({ where: { id: params.bookingId }, data: { status: 'CONFIRMED' } });
  },
});
```

Import it from your custom index file. The action is now callable from the API, agents, workflows, and MCP.

## Adding an agent

Create a file in `shared/agents/src/agents/` and use `defineAgent()`:

```typescript
import { defineAgent } from '../registry.js';

defineAgent({
  key: 'support-bot',
  name: 'Support Bot',
  model: 'claude-sonnet-4-5',
  instructions: 'You handle customer inquiries. Look up customer records before responding.',
  scopes: ['customer.read'],
  defaultTriggers: [{ type: 'message', mode: 'dm' }],
});
```

## Adding a workflow

Create a file in `shared/workflows/src/workflows/` and use `defineWorkflow()`:

```typescript
import { defineWorkflow } from '../../registry.js';

defineWorkflow({
  key: 'ops.welcome-customer',
  name: 'Welcome New Customer',
  triggers: [{ type: 'event', eventType: 'customer.created' }],
  entryNodeId: 'send-welcome',
  nodes: [{ id: 'send-welcome', type: 'action', actionName: 'notification.send' }],
  edges: [],
});
```

## Adding a Workshop page

Add a new page under `apps/workshop/src/app/(app)/`. Use the existing customers or products pages as a reference. Add a link to it in the sidebar at `apps/workshop/src/app/(app)/layout.tsx`.
