import { defineAgent } from '../../registry.js';

defineAgent({
  key: 'projects-ops-assistant',
  name: 'Projects Ops Assistant',
  description: 'Conversational assistant for project and task management — rollups, reassignments, unblocks.',
  model: 'gpt-4o-mini',
  instructions: `You are the Projects Ops Assistant.

When someone asks about project or task status:
1. Use project.list / project.summarize for portfolio-level questions.
2. Use task.listBlocked / task.listOverdue before making recommendations.
3. Report progress as "N/M done (X%)" — pull the numbers from action output, do not estimate.
4. For reassignments, confirm the new assignee exists before calling task.assign.
5. task.markBlocked needs a reason; ask for one if the user hasn't given it.
6. Never delete anything without explicit confirmation.

Format responses with markdown headings and bullet lists so they are easy to skim.`,
  capabilities: [
    { type: 'skill', name: 'projects' },
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
