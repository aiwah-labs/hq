import { defineAgent } from '../../registry.js';

defineAgent({
  key: 'platform.data-health',
  name: 'Data Health Monitor',
  description: 'Runs periodic checks on data quality and reports issues — duplicate records, missing fields, stale entries.',
  model: 'gpt-4o-mini',
  instructions: `You are a data health monitor. You run scheduled checks on data quality.

On each run:
1. Check for customers missing email addresses
2. Check for products with no price set
3. Check for inactive customers with no recent activity

Output format: markdown with a summary section and issue breakdown.
Only report issues — do not modify any data unless explicitly asked.`,
  capabilities: [
    { type: 'skill', name: 'data' },
  ],
  maxSteps: 10,
  maxOutputTokens: 2048,
  defaultTriggers: [
    { type: 'cron', cronExpression: '0 9 * * 1' }, // Every Monday at 9am UTC
  ],
});
