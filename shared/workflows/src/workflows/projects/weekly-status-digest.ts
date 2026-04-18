import { defineWorkflow } from '../../registry.js';
import type { WorkflowExecutionContext, StepEval } from '../../types.js';

/**
 * Weekly Status Digest
 *
 * Walks every active project, gathers stats, and compiles a rollup digest.
 * Designed to run on a cron; can also be triggered manually from the
 * project portfolio view.
 */
defineWorkflow({
  key: 'projects.weekly-status-digest',
  name: 'Weekly project status digest',
  description: 'Compile a status digest across all active projects — progress, blockers, and overdue tasks.',
  version: 1,
  category: 'projects',
  tags: ['projects', 'status', 'digest'],

  triggers: [
    { type: 'manual' },
    { type: 'cron', cronExpression: '0 9 * * 1' },
  ],

  annotation: {
    icon: 'calendar-check',
    color: '#0f766e',
    estimatedDurationMs: 8_000,
  },

  entryNodeId: 'list-projects',

  nodes: [
    {
      id: 'list-projects',
      type: 'action',
      actionName: 'project.list',
      inputMap: {
        filters: { status: ['PLANNED', 'ACTIVE', 'BLOCKED'] },
        limit: 100,
      },
      annotation: {
        label: 'List active projects',
        description: 'Load projects with status in PLANNED/ACTIVE/BLOCKED',
        category: 'data',
        icon: 'folder',
        color: '#059669',
      },
    },
    {
      id: 'summarise-each',
      type: 'function',
      annotation: {
        label: 'Summarise each project',
        description: 'Call project.summarize for every project in the list',
        category: 'rollup',
        icon: 'bar-chart',
        color: '#7c3aed',
      },
      handler: async (_input: unknown, ctx: WorkflowExecutionContext) => {
        const listOutput = ctx.steps['list-projects']?.output as any;
        const items: Array<{ id: string }> = Array.isArray(listOutput?.items)
          ? listOutput.items
          : Array.isArray(listOutput)
            ? listOutput
            : [];

        const summaries: Array<Record<string, unknown>> = [];
        for (const item of items) {
          try {
            const { dispatchAction } = await import('@hq/actions');
            const outcome = await dispatchAction(
              'project.summarize',
              { projectId: item.id, lookaheadDays: 7 },
              ctx.principal,
            );
            if (outcome.ok) summaries.push(outcome.result as Record<string, unknown>);
          } catch (err) {
            summaries.push({ projectId: item.id, error: (err as Error).message });
          }
        }
        return { count: summaries.length, summaries };
      },
    },
    {
      id: 'compile-digest',
      type: 'function',
      annotation: {
        label: 'Compile digest',
        description: 'Build a single markdown digest of all project summaries',
        category: 'reporting',
        icon: 'file-text',
        color: '#7c3aed',
      },
      handler: async (_input: unknown, ctx: WorkflowExecutionContext) => {
        const out = ctx.steps['summarise-each']?.output as any;
        const summaries: any[] = out?.summaries ?? [];

        const totalBlocked = summaries.reduce((n, s) => n + (s?.counts?.blocked ?? 0), 0);
        const totalOverdue = summaries.reduce((n, s) => n + (s?.counts?.overdue ?? 0), 0);

        const lines: string[] = [];
        lines.push(`# Weekly project digest — ${new Date().toISOString().slice(0, 10)}`);
        lines.push('');
        lines.push(`Active projects: ${summaries.length} · Blocked tasks: ${totalBlocked} · Overdue tasks: ${totalOverdue}`);
        lines.push('');
        for (const s of summaries) {
          if (typeof s?.summary === 'string') {
            lines.push(s.summary);
            lines.push('');
            lines.push('---');
            lines.push('');
          } else if (s?.error) {
            lines.push(`- (could not summarise project ${s.projectId}: ${s.error})`);
          }
        }
        return {
          projectsCovered: summaries.length,
          totalBlocked,
          totalOverdue,
          digest: lines.join('\n'),
          generatedAt: new Date().toISOString(),
        };
      },
    },
  ],

  edges: [
    { from: 'list-projects', to: 'summarise-each' },
    { from: 'summarise-each', to: 'compile-digest' },
  ],

  evals: {
    'compile-digest': async (_input, output): Promise<StepEval[]> => {
      const report = output as any;
      return [
        {
          name: 'digest_emitted',
          passed: typeof report?.digest === 'string' && report.digest.length > 0,
          detail: `${report?.projectsCovered ?? 0} projects summarised`,
        },
      ];
    },
  },
});
