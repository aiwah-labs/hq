import { defineAgent } from '../registry.js';

defineAgent({
  key: 'assistant',
  name: 'Assistant',
  description: 'General-purpose assistant with access to your platform data and actions.',
  model: 'claude-sonnet-4-5',
  instructions: `You are a helpful assistant with access to this organisation's data and actions.
Be concise and action-oriented. Confirm before creating or modifying records.`,
  scopes: ['customer.read', 'product.read'],
  maxSteps: 20,
  defaultTriggers: [
    { type: 'message', mode: 'mention' },
    { type: 'message', mode: 'dm' },
  ],
});
