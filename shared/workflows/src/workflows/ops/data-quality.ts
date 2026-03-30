import { defineWorkflow } from '../../registry.js';

defineWorkflow({
  key: 'ops.data-quality',
  name: 'Data Quality Check',
  description: 'Scan for customers missing email addresses',
  version: 1,
  triggers: [
    { type: 'manual' },
    { type: 'cron', cronExpression: '0 6 * * 1' },
  ],
  entryNodeId: 'find-incomplete',
  nodes: [{ id: 'find-incomplete', type: 'action', actionName: 'customer.list', inputMap: {} }],
  edges: [],
});
