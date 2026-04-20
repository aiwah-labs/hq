import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'task.create',
  title: 'Create task',
  description: 'Create a new task in a project.',
  category: 'custom',
  objects: { writes: ['Task'] },
  scopes: ['task.write'],
  parameters: z.object({
    projectId: z.string().min(1),
    title: z.string().min(1).max(500),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    assigneeUserId: z.string().min(1).optional(),
    dueInDays: z.number().int().optional(),
  }),
  handler: async (params, ctx) => {
    const project = await ctx.db.project.findUniqueOrThrow({ where: { id: params.projectId } });
    const dueAt =
      params.dueInDays != null
        ? new Date(Date.now() + params.dueInDays * 24 * 60 * 60 * 1000)
        : null;

    const task = await ctx.db.task.create({
      data: {
        title: params.title,
        priority: params.priority,
        projectId: project.id,
        assigneeUserId: params.assigneeUserId ?? null,
        dueAt,
      },
    });

    // Notify assignee if set
    if (params.assigneeUserId) {
      await ctx.db.inboxItem.create({
        data: {
          recipientUserId: params.assigneeUserId,
          type: 'task_assigned',
          title: `New task: ${task.title}`,
          body: `Assigned to you in "${project.name}"`,
          sourceType: 'Task',
          sourceId: task.id,
          actionUrl: `/projects/${project.id}`,
        },
      });
    }

    return task;
  },
});
