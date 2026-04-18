import { defineWorkflow } from '../../registry.js';
import type { WorkflowExecutionContext, StepEval } from '../../types.js';

/**
 * Stale project review
 *
 * Finds projects whose tasks haven't moved for two weeks and surfaces a
 * "needs attention" list. Intentionally doesn't mutate anything — the agent or
 * a human decides what to do next.
 */
defineWorkflow({
  key: 'projects.stale-review',
  name: 'Stale project review',
  description: 'Surface projects whose tasks have not moved in 14 days.',
  version: 1,
  category: 'projects',
  tags: ['projects', 'hygiene'],

  triggers: [
    { type: 'manual' },
    { type: 'cron', cronExpression: '0 10 * * *' },
  ],

  annotation: {
    icon: 'alert-triangle',
    color: '#d97706',
    estimatedDurationMs: 4_000,
  },

  entryNodeId: 'load-projects',

  nodes: [
    {
      id: 'load-projects',
      type: 'action',
      actionName: 'project.list',
      inputMap: {
        filters: { status: ['PLANNED', 'ACTIVE'] },
        limit: 200,
      },
      annotation: {
        label: 'Load active projects',
        category: 'data',
        icon: 'folder',
        color: '#059669',
      },
    },
    {
      id: 'find-stale',
      type: 'function',
      annotation: {
        label: 'Find stale projects',
        description: 'A project is stale when its latest task updatedAt is > 14d ago',
        category: 'analysis',
        icon: 'clock',
        color: '#d97706',
      },
      handler: async (_input: unknown, ctx: WorkflowExecutionContext) => {
        const listOut = ctx.steps['load-projects']?.output as any;
        const items: Array<{ id: string; name: string; updatedAt?: string }> = Array.isArray(listOut?.items)
          ? listOut.items
          : [];
        const { db } = await import('@hq/db');
        const now = Date.now();
        const staleMs = 14 * 24 * 60 * 60 * 1000;
        const stale: Array<Record<string, unknown>> = [];
        for (const p of items) {
          const latest = await db.task.findFirst({
            where: { projectId: p.id },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true },
          });
          const lastMovementAt = latest?.updatedAt ?? (p.updatedAt ? new Date(p.updatedAt) : new Date(0));
          const age = now - new Date(lastMovementAt).getTime();
          if (age > staleMs) {
            stale.push({
              projectId: p.id,
              name: p.name,
              lastMovementAt: new Date(lastMovementAt).toISOString(),
              ageDays: Math.round(age / (24 * 60 * 60 * 1000)),
            });
          }
        }
        return { count: stale.length, stale };
      },
    },
  ],

  edges: [
    { from: 'load-projects', to: 'find-stale' },
  ],

  evals: {
    'find-stale': async (_input, output): Promise<StepEval[]> => {
      const out = output as any;
      return [
        {
          name: 'stale_computed',
          passed: typeof out?.count === 'number',
          detail: `${out?.count ?? 0} stale projects`,
        },
      ];
    },
  },
});
