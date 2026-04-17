import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'task.complete',
  title: 'Complete task',
  description: 'Mark a task as DONE and clear any blocked reason.',
  category: 'custom',
  objects: { writes: ['Task'] },
  scopes: ['task.write'],
  parameters: z.object({
    taskId: z.string().min(1),
  }),
  handler: async (params, ctx) => {
    return ctx.db.task.update({
      where: { id: params.taskId },
      data: { status: 'DONE', blockedReason: null },
    });
  },
});
