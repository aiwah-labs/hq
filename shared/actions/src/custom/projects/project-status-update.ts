import { z } from 'zod';
import { defineAction } from '../../registry.js';

/**
 * Append a status-update line to a project's summary. Used by the weekly
 * status digest workflow and surfaced as a one-click "post update" action on
 * the project detail page.
 */
defineAction({
  name: 'project.createStatusUpdate',
  title: 'Post project status update',
  description: 'Append a dated status-update line to a project summary.',
  category: 'custom',
  objects: { writes: ['Project'] },
  scopes: ['project.write'],
  parameters: z.object({
    projectId: z.string().min(1),
    body: z.string().min(1).max(4000),
  }),
  handler: async (params, ctx) => {
    const project = await ctx.db.project.findUniqueOrThrow({ where: { id: params.projectId } });
    const existing = project.summary ?? '';
    const header = `[${new Date().toISOString().slice(0, 10)}] Update`;
    const updated = existing
      ? `${existing}\n\n${header}\n${params.body.trim()}`
      : `${header}\n${params.body.trim()}`;
    return ctx.db.project.update({
      where: { id: project.id },
      data: { summary: updated },
    });
  },
});
