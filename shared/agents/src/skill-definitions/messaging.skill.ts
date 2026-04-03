// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import { defineSkill } from '../skills.js';

export const messagingSkill = defineSkill({
  name: 'messaging',
  description: 'Post messages and manage threads in Workshop channels',
  actions: ['thread.post', 'thread.list', 'thread.get', 'messaging.search_history'],
  instructions: `When posting to threads:
- Keep replies concise and action-oriented
- Use markdown formatting for structured data

When asked about past conversations or previous sessions, use messaging.search_history to look it up rather than guessing.`,
});
