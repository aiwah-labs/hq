import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'task.assign',
  title: 'Assign task',
  description: 'Assign a task to a user (or clear the assignee).',
  category: 'custom',
  objects: { writes: ['Task'] },
  scopes: ['task.write'],
  parameters: z.object({
    taskId: z.string().min(1),
    assigneeUserId: z.string().min(1).nullable(),
  }),
  handler: async (params, ctx) => {
    if (params.assigneeUserId !== null) {
      // Validate the user exists to avoid silent FK violations.
      await ctx.db.user.findUniqueOrThrow({ where: { id: params.assigneeUserId } });
    }
    return ctx.db.task.update({
      where: { id: params.taskId },
      data: { assigneeUserId: params.assigneeUserId },
    });
  },
});
