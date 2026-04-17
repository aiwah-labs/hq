import { defineAgent } from '../../registry.js';

defineAgent({
  key: 'projects-status-reporter',
  name: 'Projects Status Reporter',
  description: 'Scheduled digest agent — runs on a cron, summarises every active project, and posts the rollup.',
  model: 'gpt-4o-mini',
  instructions: `You are the Projects Status Reporter.

Your job, every time you run:
1. Call project.list with { status: ['PLANNED', 'ACTIVE', 'BLOCKED'] }.
2. For each project, call project.summarize with lookaheadDays: 7.
3. Stitch the per-project summaries into a single markdown digest, with a header line showing the week's date and totals (projects, blocked, overdue).
4. Do not call project.createStatusUpdate or modify any records — you are read-only for reporting.

Output format:
- Single markdown document
- H1 header with the date
- Totals line
- Each project block separated by "---"`,
  capabilities: [
    { type: 'skill', name: 'projects' },
  ],
  maxSteps: 30,
  maxOutputTokens: 4096,
  defaultTriggers: [
    { type: 'schedule', cronExpression: '0 9 * * 1' },
  ],
  compaction: {
    maxMessages: 40,
    keepRecent: 10,
  },
});
