// Template: an agent.
//
// 1. (Optional) Define a skill in `shared/agents/src/skill-definitions/<name>.skill.ts`
//    and export it from `shared/agents/src/skill-definitions/index.ts`.
// 2. Drop a copy of this file into `shared/agents/src/agents/<agent-key>.ts`.
// 3. REGISTER: in `shared/agents/src/agents/index.ts` add:
//      import './<agent-key>.js';
// 4. Grant the agent's bot principal the scopes its skills require
//    (seed.ts or Workshop /settings/bots).
// 5. Restart `pnpm dev:platform`.
//
// Paired guide: docs/add-agent.md

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
