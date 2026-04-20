import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'project.list',
  title: 'List projects',
  description: 'List projects with optional search, filters, sort, and pagination.',
  category: 'crud',
  objects: { reads: ['Project'] },
  scopes: ['project.read'],
  parameters: z.object({
    q: z.string().optional(),
    status: z.enum(['PLANNED', 'ACTIVE', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    ownerUserId: z.string().optional(),
    limit: z.number().int().positive().optional(),
    cursor: z.string().optional(),
    sortBy: z.enum(['name', 'status', 'priority', 'startDate', 'targetDate', 'createdAt', 'updatedAt']).optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  }),
  handler: async (params, ctx) => {
    const where: Record<string, unknown> = {};
    if (params.q) where.name = { contains: params.q, mode: 'insensitive' };
    if (params.status) where.status = params.status;
    if (params.priority) where.priority = params.priority;
    if (params.ownerUserId) where.ownerUserId = params.ownerUserId;
    if (params.cursor) where.id = { gt: params.cursor };

    const limit = params.limit ?? 50;
    const orderBy = { [params.sortBy ?? 'updatedAt']: params.sortDir ?? 'desc' };

    const [items, total] = await Promise.all([
      ctx.db.project.findMany({ where, orderBy, take: limit }),
      ctx.db.project.count({ where }),
    ]);

    return { items, total };
  },
});

defineAction({
  name: 'project.get',
  title: 'Get project',
  description: 'Return a single project by id, including its tasks.',
  category: 'crud',
  objects: { reads: ['Project'] },
  scopes: ['project.read'],
  parameters: z.object({ id: z.string().min(1) }),
  handler: async (params, ctx) => {
    return ctx.db.project.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        tasks: { orderBy: { createdAt: 'asc' } },
        owner: { select: { id: true, email: true, name: true } },
      },
    });
  },
});

defineAction({
  name: 'project.update',
  title: 'Update project',
  description: 'Update fields on an existing project.',
  category: 'crud',
  objects: { writes: ['Project'] },
  scopes: ['project.write'],
  parameters: z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(300).optional(),
    summary: z.string().max(2000).nullable().optional(),
    status: z.enum(['PLANNED', 'ACTIVE', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    ownerUserId: z.string().nullable().optional(),
    targetInDays: z.number().int().positive().optional(),
  }),
  handler: async (params, ctx) => {
    const { id, targetInDays, ...rest } = params;
    const data: Record<string, unknown> = { ...rest };
    if (targetInDays != null) {
      data.targetDate = new Date(Date.now() + targetInDays * 24 * 60 * 60 * 1000);
    }
    return ctx.db.project.update({ where: { id }, data });
  },
});

defineAction({
  name: 'project.delete',
  title: 'Delete project',
  description: 'Delete a project and all its tasks.',
  category: 'crud',
  objects: { deletes: ['Project'] },
  scopes: ['project.delete'],
  risk: 'high',
  approval: {
    required: true,
    reason: 'Deleting a project permanently removes all associated tasks.',
    bypassScopes: ['approvals.decide'],
  },
  parameters: z.object({ id: z.string().min(1) }),
  handler: async (params, ctx) => {
    await ctx.db.project.delete({ where: { id: params.id } });
    return { deleted: true };
  },
});

defineAction({
  name: 'task.list',
  title: 'List tasks',
  description: 'List tasks with optional filters.',
  category: 'crud',
  objects: { reads: ['Task'] },
  scopes: ['task.read'],
  parameters: z.object({
    q: z.string().optional(),
    projectId: z.string().optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    assigneeUserId: z.string().optional(),
    limit: z.number().int().positive().optional(),
    cursor: z.string().optional(),
    sortBy: z.enum(['title', 'status', 'priority', 'dueAt', 'createdAt', 'updatedAt']).optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  }),
  handler: async (params, ctx) => {
    const where: Record<string, unknown> = {};
    if (params.q) where.title = { contains: params.q, mode: 'insensitive' };
    if (params.projectId) where.projectId = params.projectId;
    if (params.status) where.status = params.status;
    if (params.priority) where.priority = params.priority;
    if (params.assigneeUserId) where.assigneeUserId = params.assigneeUserId;
    if (params.cursor) where.id = { gt: params.cursor };

    const limit = params.limit ?? 50;
    const orderBy = { [params.sortBy ?? 'createdAt']: params.sortDir ?? 'desc' };

    const [items, total] = await Promise.all([
      ctx.db.task.findMany({ where, orderBy, take: limit }),
      ctx.db.task.count({ where }),
    ]);

    return { items, total };
  },
});

defineAction({
  name: 'task.get',
  title: 'Get task',
  description: 'Return a single task by id.',
  category: 'crud',
  objects: { reads: ['Task'] },
  scopes: ['task.read'],
  parameters: z.object({ id: z.string().min(1) }),
  handler: async (params, ctx) => {
    return ctx.db.task.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        project: { select: { id: true, name: true, status: true } },
        assignee: { select: { id: true, email: true, name: true } },
      },
    });
  },
});

defineAction({
  name: 'task.delete',
  title: 'Delete task',
  description: 'Delete a task by id.',
  category: 'crud',
  objects: { deletes: ['Task'] },
  scopes: ['task.delete'],
  parameters: z.object({ id: z.string().min(1) }),
  handler: async (params, ctx) => {
    await ctx.db.task.delete({ where: { id: params.id } });
    return { deleted: true };
  },
});
