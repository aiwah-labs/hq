import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'project.updateStatus',
  title: 'Update project status',
  description: 'Change the status of a project (PLANNED → ACTIVE → DONE etc.).',
  category: 'custom',
  objects: { writes: ['Project'] },
  scopes: ['project.write'],
  parameters: z.object({
    projectId: z.string().min(1),
    status: z.enum(['PLANNED', 'ACTIVE', 'BLOCKED', 'DONE', 'CANCELLED']),
  }),
  handler: async (params, ctx) => {
    return ctx.db.project.update({
      where: { id: params.projectId },
      data: { status: params.status },
    });
  },
});
