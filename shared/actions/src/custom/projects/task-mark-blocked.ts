import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'task.markBlocked',
  title: 'Mark task blocked',
  description: 'Move a task to BLOCKED status with a required reason.',
  category: 'custom',
  objects: { writes: ['Task'] },
  scopes: ['task.write'],
  parameters: z.object({
    taskId: z.string().min(1),
    reason: z.string().min(1).max(1000),
  }),
  handler: async (params, ctx) => {
    return ctx.db.task.update({
      where: { id: params.taskId },
      data: { status: 'BLOCKED', blockedReason: params.reason },
    });
  },
});
