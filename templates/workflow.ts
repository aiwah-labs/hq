// Template: a workflow.
//
// 1. Drop a copy into `shared/workflows/src/workflows/<domain>/<flow>.ts`.
// 2. REGISTER: in `shared/workflows/src/workflows/index.ts` add:
//      import './<domain>/<flow>.js';
// 3. Restart `pnpm dev:platform`.
//
// Paired guide: docs/add-workflow.md

import { defineWorkflow } from '../../registry.js';
import type { WorkflowExecutionContext, StepEval } from '../../types.js';

defineWorkflow({
  key: 'invoices.collect-overdue',
  name: 'Collect overdue invoices',
  description: 'Every weekday, find overdue invoices and send reminders.',
  version: 1,
  category: 'ops',
  tags: ['billing', 'reminders'],

  triggers: [
    { type: 'manual' },
    { type: 'cron', cronExpression: '0 10 * * 1-5' }, // 10am Mon–Fri
  ],

  annotation: {
    icon: 'receipt',
    color: '#d97706',
    estimatedDurationMs: 10_000,
  },

  entryNodeId: 'find-overdue',

  nodes: [
    {
      id: 'find-overdue',
      type: 'action',
      actionName: 'invoice.list',
      inputMap: {
        where: { status: 'sent', dueDate: { lt: '{{now}}' } },
        limit: 100,
      },
      annotation: { label: 'Find overdue invoices', icon: 'search' },
    },
    {
      id: 'send-reminder',
      type: 'action',
      actionName: 'invoice.sendReminder',
      inputMap: { id: '{{item.id}}' },
      forEach: { source: 'steps.find-overdue.output.items', as: 'item' },
      annotation: { label: 'Send reminders', icon: 'mail' },
    },
    {
      id: 'log-result',
      type: 'function',
      annotation: { label: 'Log result', icon: 'file-text' },
      handler: async (_input: unknown, ctx: WorkflowExecutionContext) => {
        const invoices = ctx.steps['find-overdue']?.output as { items: unknown[] };
        return { remindersSent: invoices?.items?.length ?? 0 };
      },
    },
  ],

  edges: [
    { from: 'find-overdue',  to: 'send-reminder' },
    { from: 'send-reminder', to: 'log-result' },
  ],

  evals: {
    'log-result': async (_in, out): Promise<StepEval[]> => {
      const r = out as { remindersSent: number };
      return [
        {
          name: 'reminders_sent',
          passed: typeof r?.remindersSent === 'number',
          score: 1,
          detail: `Sent ${r?.remindersSent ?? 0} reminders`,
        },
      ];
    },
  },
});
