import { z } from 'zod';
import { defineAction } from '../../registry.js';

/**
 * Produce a deterministic, plain-text summary of a project's state. No LLM
 * dependency — this action is used by status-digest workflows and gives agents
 * a reliable rollup to quote verbatim.
 */
defineAction({
  name: 'project.summarize',
  title: 'Summarize project',
  description: 'Build a plain-text executive summary of a project (status, task counts, blockers, upcoming).',
  category: 'custom',
  objects: { reads: ['Project', 'Task'] },
  scopes: ['project.read'],
  parameters: z.object({
    projectId: z.string().min(1),
    lookaheadDays: z.number().int().positive().max(60).default(7),
  }),
  handler: async (params, ctx) => {
    const project = await ctx.db.project.findUniqueOrThrow({
      where: { id: params.projectId },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    const now = new Date();
    const lookahead = new Date(now.getTime() + params.lookaheadDays * 24 * 60 * 60 * 1000);

    const [tasks, blocked, overdue, upcoming] = await Promise.all([
      ctx.db.task.findMany({ where: { projectId: project.id } }),
      ctx.db.task.findMany({
        where: { projectId: project.id, status: 'BLOCKED' },
        orderBy: { updatedAt: 'desc' },
      }),
      ctx.db.task.findMany({
        where: {
          projectId: project.id,
          dueAt: { lt: now },
          status: { notIn: ['DONE', 'CANCELLED'] },
        },
        orderBy: { dueAt: 'asc' },
      }),
      ctx.db.task.findMany({
        where: {
          projectId: project.id,
          dueAt: { gte: now, lte: lookahead },
          status: { notIn: ['DONE', 'CANCELLED'] },
        },
        orderBy: { dueAt: 'asc' },
      }),
    ]);

    const done = tasks.filter((t: { status: string }) => t.status === 'DONE').length;
    const total = tasks.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const lines: string[] = [];
    lines.push(`# ${project.name}`);
    if (project.summary) lines.push(project.summary);
    lines.push('');
    lines.push(`Status: **${project.status}** · Priority: **${project.priority}**`);
    if (project.owner) lines.push(`Owner: ${project.owner.name ?? project.owner.email}`);
    if (project.targetDate) lines.push(`Target: ${project.targetDate.toISOString().slice(0, 10)}`);
    lines.push('');
    lines.push(`Progress: ${done}/${total} tasks done (${pct}%).`);
    lines.push(`Blocked: ${blocked.length} · Overdue: ${overdue.length} · Due in next ${params.lookaheadDays}d: ${upcoming.length}`);

    if (blocked.length > 0) {
      lines.push('');
      lines.push('## Blocked');
      for (const t of blocked) {
        lines.push(`- ${t.title}${t.blockedReason ? ` — ${t.blockedReason}` : ''}`);
      }
    }
    if (overdue.length > 0) {
      lines.push('');
      lines.push('## Overdue');
      for (const t of overdue) {
        const due = t.dueAt ? t.dueAt.toISOString().slice(0, 10) : 'no due date';
        lines.push(`- ${t.title} (${due})`);
      }
    }
    if (upcoming.length > 0) {
      lines.push('');
      lines.push(`## Upcoming (next ${params.lookaheadDays}d)`);
      for (const t of upcoming) {
        const due = t.dueAt ? t.dueAt.toISOString().slice(0, 10) : 'no due date';
        lines.push(`- ${t.title} (${due})`);
      }
    }

    return {
      projectId: project.id,
      name: project.name,
      status: project.status,
      completionPct: pct,
      counts: {
        total,
        done,
        blocked: blocked.length,
        overdue: overdue.length,
        upcoming: upcoming.length,
      },
      summary: lines.join('\n'),
    };
  },
});
