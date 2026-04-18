# Add an agent

An **agent** is an AI actor that can read and write through the action layer.
Agents get tool access via **skills** (named bundles of actions + instructions)
so you can reuse capability profiles across multiple agents.

Full reference: [`agents.md`](agents.md). This page is the quickstart.

## Steps

### 1. Define a skill (if you need one)

Skills bundle actions and give the LLM domain-specific instructions. If an
existing skill covers what you need (`data`, `messaging`, `projects`), skip
to step 2.

Create [`shared/agents/src/skill-definitions/invoices.skill.ts`](../shared/agents/src/skill-definitions/):

```ts
import { defineSkill } from '../skills.js';

export const invoicesSkill = defineSkill({
  name: 'invoices',
  description: 'Read invoices, reconcile payment state, prompt collections.',
  actions: [
    'invoice.list',
    'invoice.get',
    'invoice.count',
    'invoice.markPaid',
    'invoice.sendReminder',
  ],
  instructions: `When working with invoices:
- Use invoice.list with status filters before taking any action.
- Never call invoice.markPaid without a confirmed payment source.
- For overdue reminders, call invoice.sendReminder one invoice at a time.
- Do not delete invoices.`,
});
```

Register it in [`shared/agents/src/skill-definitions/index.ts`](../shared/agents/src/skill-definitions/index.ts):

```ts
export { invoicesSkill } from './invoices.skill.js';
```

### 2. Define the agent

Create [`shared/agents/src/agents/billing-assistant.ts`](../shared/agents/src/agents/):

```ts
import { defineAgent } from '../registry.js';

defineAgent({
  key: 'billing-assistant',
  name: 'Billing Assistant',
  description: 'Answers questions about invoices and nudges overdue accounts.',
  model: 'gpt-4o-mini',
  instructions: `You are the Billing Assistant.

When asked for billing status:
1. Use invoice.list with the right status filter before summarising.
2. Report amounts with the right currency — never make them up.
3. For overdue accounts, suggest next steps but do not send reminders unless
   the human confirms.
4. Never mark an invoice paid without a payment source in the request.

Respond in markdown with clear headings.`,
  capabilities: [
    { type: 'skill', name: 'invoices' },
    { type: 'skill', name: 'messaging' },
  ],
  maxSteps: 20,
  maxOutputTokens: 4096,
  defaultTriggers: [
    { type: 'message', mode: 'mention' },
    { type: 'message', mode: 'dm' },
  ],
  channelBehavior: {
    dm:    { access: 'allow_all', alwaysRespond: true },
    group: { mode: 'on_mention', threadFollow: 'follow', alwaysRespond: true },
  },
  compaction: { maxMessages: 100, keepRecent: 20 },
});
```

Register at import time in [`shared/agents/src/agents/index.ts`](../shared/agents/src/agents/index.ts):

```ts
import './billing-assistant.js';
```

### 3. Grant permissions

The agent runs as a bot principal. The bot needs the scopes the actions in
its skills require. Edit the bot's scopes in
[`shared/db/src/seed.ts`](../shared/db/src/seed.ts) (or via the Workshop's
`/settings/bots` UI) so the bot for `billing-assistant` has `invoice.read` +
`invoice.write`.

If an action is marked `approval.required: true`, the agent will hit the
approval queue — a human needs to approve before the mutation runs. Good.

### 4. Use it

- **Workshop:** `/agents/billing-assistant` — test-run window with
  conversation history, tool calls, and approval flow.
- **Messaging:** when the agent's bot is added to a channel / DM, the
  trigger config decides when it responds.
- **MCP:** every action the agent can call is also exposed as an MCP tool,
  so external Claude instances can work with the same surface.
- **Workflow handoff:** a workflow `agent` node with `agentKey:
  'billing-assistant'` hands off mid-flow with a scoped tool set.

## Decision checklist

- **Does this agent need LLM judgment?** If not, write a workflow instead.
- **Which actions does it need?** Assemble them into a skill — never inline
  a raw action list onto the agent unless it's single-use.
- **Do any of its actions mutate prod data?** Mark those actions
  `approval.required: true`. The runner surfaces the pending approval; the
  agent doesn't silently wait, it tells the user.
- **Is the conversation long-running?** Tune `compaction` so the agent keeps
  the most recent turns and summarises the rest.

## Conventions

- **Instructions are short and concrete.** "When X, do Y" sentences; no long
  prose. The LLM follows a numbered list better than a narrative.
- **Skills are reusable.** If two agents need the same capabilities, bundle
  them in a skill, not duplicated action arrays.
- **Tool access ≠ scope grant.** The agent can only *see* actions in its
  skills. It can only *run* actions whose scopes the bot principal has.
  Keep both in sync.

## Next

- Add an inbox notification when the agent hands off → [`inbox.md`](inbox.md)
- Let the agent use external APIs → [`integrations.md`](integrations.md)
- Audit what the agent actually did → every action run lands in
  `ActionExecution` + the activity timeline for free.
