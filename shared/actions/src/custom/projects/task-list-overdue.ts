import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'task.listOverdue',
  title: 'List overdue tasks',
  description: 'Return tasks whose due date has passed and are not yet DONE/CANCELLED.',
  category: 'custom',
  objects: { reads: ['Task'] },
  scopes: ['task.read'],
  parameters: z.object({
    projectId: z.string().min(1).optional(),
    assigneeUserId: z.string().min(1).optional(),
    limit: z.number().int().positive().max(200).default(50),
  }),
  handler: async (params, ctx) => {
    const now = new Date();
    const tasks = await ctx.db.task.findMany({
      where: {
        dueAt: { lt: now },
        status: { notIn: ['DONE', 'CANCELLED'] },
        ...(params.projectId ? { projectId: params.projectId } : {}),
        ...(params.assigneeUserId ? { assigneeUserId: params.assigneeUserId } : {}),
      },
      orderBy: { dueAt: 'asc' },
      take: params.limit,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
    return { count: tasks.length, tasks };
  },
});
