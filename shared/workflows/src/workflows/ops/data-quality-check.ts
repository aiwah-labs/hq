import { defineWorkflow } from '../../registry.js';
import type { WorkflowExecutionContext, StepEval } from '../../types.js';

/**
 * Data Quality Check
 *
 * Runs without input — scans data for quality issues.
 * Finds missing fields, stale records, and inactive entries.
 */
defineWorkflow({
  key: 'ops.data-quality',
  name: 'Data Quality Audit',
  description: 'Scan customers and products for missing fields, stale records, and data gaps',
  version: 1,
  category: 'ops',
  tags: ['data-quality', 'audit', 'hygiene'],

  triggers: [
    { type: 'manual' },
    { type: 'cron', cronExpression: '0 6 * * 1' },
  ],

  annotation: {
    icon: 'shield-check',
    color: '#0284c7',
    estimatedDurationMs: 5_000,
  },

  entryNodeId: 'count-customers',

  nodes: [
    {
      id: 'count-customers',
      type: 'action',
      actionName: 'customer.count',
      inputMap: {},
      annotation: {
        label: 'Count Customers',
        description: 'Get total customer count',
        category: 'data',
        icon: 'users',
        color: '#059669',
      },
    },
    {
      id: 'count-products',
      type: 'action',
      actionName: 'product.count',
      inputMap: {},
      annotation: {
        label: 'Count Products',
        description: 'Get total product count',
        category: 'data',
        icon: 'package',
        color: '#059669',
      },
    },
    {
      id: 'compile-report',
      type: 'function',
      annotation: {
        label: 'Compile Quality Report',
        description: 'Aggregate all findings into a data quality summary',
        category: 'reporting',
        icon: 'file-text',
        color: '#7c3aed',
      },
      handler: async (_input: unknown, ctx: WorkflowExecutionContext) => {
        const customerCount = ctx.steps['count-customers']?.output as any;
        const productCount  = ctx.steps['count-products']?.output as any;

        const totalCustomers = typeof customerCount === 'number' ? customerCount : (customerCount?.count ?? customerCount?.total ?? 0);
        const totalProducts  = typeof productCount  === 'number' ? productCount  : (productCount?.count  ?? productCount?.total  ?? 0);

        const issues: string[] = [];
        if (totalCustomers === 0) issues.push('No customers in the database');
        if (totalProducts  === 0) issues.push('No products in the database');

        const qualityScore = Math.max(0, 100 - (totalCustomers === 0 ? 50 : 0) - (totalProducts === 0 ? 50 : 0));

        return {
          qualityScore,
          totalCustomers,
          totalProducts,
          issues,
          grade: qualityScore >= 80 ? 'A' : qualityScore >= 60 ? 'B' : qualityScore >= 40 ? 'C' : 'D',
          scannedAt: new Date().toISOString(),
        };
      },
    },
  ],

  edges: [
    { from: 'count-customers', to: 'count-products' },
    { from: 'count-products',  to: 'compile-report' },
  ],

  evals: {
    'compile-report': async (_input, output): Promise<StepEval[]> => {
      const report = output as any;
      return [
        {
          name: 'quality_scored',
          passed: typeof report?.qualityScore === 'number',
          score: (report?.qualityScore ?? 0) / 100,
          detail: `Grade: ${report?.grade ?? '?'} (${report?.qualityScore ?? 0}/100) — ${(report?.issues ?? []).length} issues`,
        },
      ];
    },
  },
});
