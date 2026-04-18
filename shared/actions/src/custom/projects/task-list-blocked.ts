import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'task.listBlocked',
  title: 'List blocked tasks',
  description: 'Return all tasks currently in BLOCKED status, optionally scoped to a project.',
  category: 'custom',
  objects: { reads: ['Task'] },
  scopes: ['task.read'],
  parameters: z.object({
    projectId: z.string().min(1).optional(),
    limit: z.number().int().positive().max(200).default(50),
  }),
  handler: async (params, ctx) => {
    const tasks = await ctx.db.task.findMany({
      where: {
        status: 'BLOCKED',
        ...(params.projectId ? { projectId: params.projectId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: params.limit,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
    return { count: tasks.length, tasks };
  },
});
