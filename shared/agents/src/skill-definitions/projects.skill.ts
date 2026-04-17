import { defineSkill } from '../skills.js';

export const projectsSkill = defineSkill({
  name: 'projects',
  description: 'Read Projects and Tasks, produce rollup summaries, post status updates, manage task state.',
  actions: [
    'project.list',
    'project.get',
    'project.count',
    'project.create',
    'project.update',
    'project.delete',
    'project.stats',
    'project.summarize',
    'project.createStatusUpdate',
    'task.list',
    'task.get',
    'task.count',
    'task.create',
    'task.update',
    'task.delete',
    'task.listBlocked',
    'task.listOverdue',
    'task.assign',
    'task.markBlocked',
    'task.complete',
  ],
  instructions: `When working with projects and tasks:
- Prefer project.summarize when asked for a status update — it produces a reliable markdown rollup.
- Use task.listBlocked / task.listOverdue before recommending reassignments or escalations.
- task.markBlocked requires a reason string — never call it with an empty reason.
- When creating status updates, base them on the action output, not prior assumptions — the actions return deterministic data.
- Do not delete projects/tasks on the user's behalf without explicit confirmation.`,
});
