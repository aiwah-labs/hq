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
      await ctx.db.user.findUniqueOrThrow({ where: { id: params.assigneeUserId } });
    }
    const task = await ctx.db.task.update({
      where: { id: params.taskId },
      data: { assigneeUserId: params.assigneeUserId },
      include: { project: { select: { id: true, name: true } } },
    });

    if (params.assigneeUserId) {
      await ctx.db.inboxItem.create({
        data: {
          recipientUserId: params.assigneeUserId,
          type: 'task_assigned',
          title: `Task assigned: ${task.title}`,
          body: `In project "${task.project.name}"`,
          sourceType: 'Task',
          sourceId: task.id,
          actionUrl: `/projects/${task.project.id}`,
        },
      });
    }

    return task;
  },
});
