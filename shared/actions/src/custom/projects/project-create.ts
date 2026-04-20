import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'project.create',
  title: 'Create project',
  description: 'Create a new project owned by the calling user.',
  category: 'custom',
  objects: { writes: ['Project'] },
  scopes: ['project.write'],
  parameters: z.object({
    name: z.string().min(1).max(300),
    summary: z.string().max(2000).optional(),
    status: z.enum(['PLANNED', 'ACTIVE', 'BLOCKED']).default('PLANNED'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    targetInDays: z.number().int().positive().optional(),
  }),
  handler: async (params, ctx) => {
    const targetDate =
      params.targetInDays != null
        ? new Date(Date.now() + params.targetInDays * 24 * 60 * 60 * 1000)
        : null;

    const ownerUserId = ctx.principal.type === 'user' ? ctx.principal.id : null;

    return ctx.db.project.create({
      data: {
        name: params.name,
        summary: params.summary ?? null,
        status: params.status,
        priority: params.priority,
        ownerUserId,
        startDate: new Date(),
        targetDate,
      },
    });
  },
});
