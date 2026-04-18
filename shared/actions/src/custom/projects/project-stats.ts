import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'project.stats',
  title: 'Project stats',
  description: 'Return rolled-up task counts for a project (total, done, blocked, overdue).',
  category: 'custom',
  objects: { reads: ['Project', 'Task'] },
  scopes: ['project.read'],
  parameters: z.object({
    projectId: z.string().min(1),
  }),
  handler: async (params, ctx) => {
    const project = await ctx.db.project.findUniqueOrThrow({ where: { id: params.projectId } });
    const now = new Date();
    const [total, done, blocked, overdue, byStatus] = await Promise.all([
      ctx.db.task.count({ where: { projectId: project.id } }),
      ctx.db.task.count({ where: { projectId: project.id, status: 'DONE' } }),
      ctx.db.task.count({ where: { projectId: project.id, status: 'BLOCKED' } }),
      ctx.db.task.count({
        where: {
          projectId: project.id,
          dueAt: { lt: now },
          status: { notIn: ['DONE', 'CANCELLED'] },
        },
      }),
      ctx.db.task.groupBy({
        by: ['status'],
        where: { projectId: project.id },
        _count: { _all: true },
      }),
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map((row: { status: string; _count: { _all: number } }) => [row.status, row._count._all]),
    );

    return {
      projectId: project.id,
      name: project.name,
      status: project.status,
      counts: { total, done, blocked, overdue },
      byStatus: statusMap,
      completion: total > 0 ? done / total : 0,
    };
  },
});
