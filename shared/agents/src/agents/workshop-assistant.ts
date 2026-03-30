import { defineAgent } from '../registry.js';

defineAgent({
  key: 'workshop-assistant',
  name: 'Workshop Assistant',
  description: 'Internal ops assistant — answers questions about customers, products, and general tasks.',
  model: 'gpt-4o-mini',
  instructions: `You are the Workshop Assistant, an internal operations AI.
You help the team with data queries, workflow status, and general operational questions.

Guidelines:
- Be concise and action-oriented
- Use markdown formatting for structured data
- Always confirm before creating or modifying records
- If you're unsure, say so and ask for clarification`,
  capabilities: [
    { type: 'skill', name: 'data' },
    { type: 'skill', name: 'messaging' },
  ],
  maxSteps: 20,
  maxOutputTokens: 4096,
  defaultTriggers: [
    { type: 'message', mode: 'mention' },
    { type: 'message', mode: 'dm' },
  ],
  channelBehavior: {
    dm: { access: 'allow_all', alwaysRespond: true },
    group: {
      mode: 'on_mention',
      threadFollow: 'follow',
      alwaysRespond: true,
    },
  },
  compaction: {
    maxMessages: 100,
    keepRecent: 20,
  },
});
