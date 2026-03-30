import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@hq/db';
import { scheduleJob } from '@hq/jobs';
import { getWorkflow, getWorkflows, serializeWorkflowDef, getRun, listRuns, getStepLog, listStepLogs } from '@hq/workflows';
import { ApiError } from '../../lib/errors.js';
import { requireAuth, requireUser } from '../../lib/auth.js';

function parseBody<T>(input: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid request payload.', parsed.error.flatten());
  }
  return parsed.data;
}

export async function registerWorkflowRoutes(app: FastifyInstance) {
  // ── List all registered workflow definitions ─────────────────────────

  app.get('/v1/workflows', async (request) => {
    await requireAuth(request, { botScope: 'workflow.read' });
    const workflows = getWorkflows();

    // Enrich with run stats
    const runCounts = await db.workflowRun.groupBy({
      by: ['workflowKey'],
      _count: { id: true },
    });
    const runCountMap = new Map(runCounts.map((r) => [r.workflowKey, r._count.id]));

    // Last run per workflow
    const lastRuns = await db.workflowRun.findMany({
      where: { workflowKey: { in: workflows.map((w) => w.key) } },
      orderBy: { createdAt: 'desc' },
      distinct: ['workflowKey'],
      select: { workflowKey: true, id: true, status: true, createdAt: true, durationMs: true },
    });
    const lastRunMap = new Map(lastRuns.map((r) => [r.workflowKey, r]));

    return workflows.map((def) => ({
      ...serializeWorkflowDef(def),
      runCount: runCountMap.get(def.key) ?? 0,
      lastRun: lastRunMap.get(def.key) ?? null,
    }));
  });

  // ── Get workflow definition + recent runs ────────────────────────────

  app.get('/v1/workflows/:key', async (request) => {
    await requireAuth(request, { botScope: 'workflow.read' });
    const { key } = request.params as { key: string };

    const def = getWorkflow(key);
    if (!def) throw new ApiError(404, 'NOT_FOUND', 'Workflow not found');

    const recentRuns = await db.workflowRun.findMany({
      where: { workflowKey: key },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { _count: { select: { steps: true } } },
    });

    // Aggregate stats
    const stats = await db.workflowRun.groupBy({
      by: ['status'],
      where: { workflowKey: key },
      _count: { id: true },
    });

    return {
      ...serializeWorkflowDef(def),
      recentRuns,
      stats: Object.fromEntries(stats.map((s) => [s.status, s._count.id])),
    };
  });

  // ── List runs for a workflow (paginated) ─────────────────────────────

  app.get('/v1/workflows/:key/runs', async (request) => {
    await requireAuth(request, { botScope: 'workflow.read' });
    const { key } = request.params as { key: string };

    if (!getWorkflow(key)) throw new ApiError(404, 'NOT_FOUND', 'Workflow not found');

    const query = request.query as { cursor?: string; limit?: string; status?: string };
    const limit = Math.min(100, parseInt(query.limit ?? '50'));

    return listRuns(key, { cursor: query.cursor, limit, status: query.status });
  });

  // ── Get full run detail with all step logs ───────────────────────────

  app.get('/v1/workflows/:key/runs/:runId', async (request) => {
    await requireAuth(request, { botScope: 'workflow.read' });
    const { key, runId } = request.params as { key: string; runId: string };

    const run = await getRun(runId);
    if (!run || run.workflowKey !== key) {
      throw new ApiError(404, 'NOT_FOUND', 'Run not found');
    }

    // Also include the workflow definition for context
    const def = getWorkflow(key);

    return {
      run,
      definition: def ? serializeWorkflowDef(def) : null,
    };
  });

  // ── Deep step inspection ─────────────────────────────────────────────

  app.get('/v1/workflows/:key/runs/:runId/steps/:stepId', async (request) => {
    await requireAuth(request, { botScope: 'workflow.read' });
    const { key, runId, stepId } = request.params as { key: string; runId: string; stepId: string };

    const step = await getStepLog(stepId);
    if (!step || step.runId !== runId) {
      throw new ApiError(404, 'NOT_FOUND', 'Step not found');
    }

    // Verify the run belongs to this workflow
    const run = await db.workflowRun.findUnique({
      where: { id: runId },
      select: { workflowKey: true },
    });
    if (!run || run.workflowKey !== key) {
      throw new ApiError(404, 'NOT_FOUND', 'Run not found');
    }

    return step;
  });

  // ── Manually trigger a workflow ──────────────────────────────────────

  app.post('/v1/workflows/:key/trigger', async (request) => {
    await requireAuth(request, { botScope: 'workflow.execute' });
    const { key } = request.params as { key: string };

    const def = getWorkflow(key);
    if (!def) throw new ApiError(404, 'NOT_FOUND', 'Workflow not found');

    // Check that the workflow supports manual triggers
    const hasManualTrigger = def.triggers.some((t) => t.type === 'manual');
    if (!hasManualTrigger) {
      throw new ApiError(400, 'BAD_REQUEST', 'Workflow does not support manual triggers');
    }

    const body = parseBody(
      request.body,
      z.object({
        input: z.record(z.string(), z.unknown()).optional(),
      })
    );

    // Validate input if schema exists
    if (def.inputSchema && body.input) {
      const parsed = def.inputSchema.safeParse(body.input);
      if (!parsed.success) {
        throw new ApiError(400, 'BAD_REQUEST', 'Invalid workflow input', parsed.error.flatten());
      }
    }

    await scheduleJob('workflow.run', {
      workflowKey: key,
      triggerType: 'manual',
      input: body.input as Record<string, unknown>,
    });

    return { ok: true, message: 'Workflow run queued' };
  });

  // ── Cancel a running workflow ────────────────────────────────────────

  app.post('/v1/workflows/:key/runs/:runId/cancel', async (request) => {
    await requireAuth(request, { botScope: 'workflow.execute' });
    const { key, runId } = request.params as { key: string; runId: string };

    const run = await db.workflowRun.findUnique({ where: { id: runId } });
    if (!run || run.workflowKey !== key) {
      throw new ApiError(404, 'NOT_FOUND', 'Run not found');
    }

    if (!['PENDING', 'RUNNING', 'PAUSED'].includes(run.status)) {
      throw new ApiError(400, 'BAD_REQUEST', `Cannot cancel a run with status: ${run.status}`);
    }

    await db.workflowRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    return { ok: true };
  });

  // ── Retry a failed workflow from the failed step ─────────────────────

  app.post('/v1/workflows/:key/runs/:runId/retry', async (request) => {
    await requireAuth(request, { botScope: 'workflow.execute' });
    const { key, runId } = request.params as { key: string; runId: string };

    const run = await db.workflowRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
    if (!run || run.workflowKey !== key) {
      throw new ApiError(404, 'NOT_FOUND', 'Run not found');
    }

    if (run.status !== 'FAILED') {
      throw new ApiError(400, 'BAD_REQUEST', 'Can only retry failed runs');
    }

    // Re-trigger the same workflow with the same input
    await scheduleJob('workflow.run', {
      workflowKey: key,
      triggerType: 'manual',
      input: (run.input ?? {}) as Record<string, unknown>,
      triggerPayload: (run.triggerPayload ?? {}) as Record<string, unknown>,
      correlationId: runId, // Link retry to original run
    });

    return { ok: true, message: 'Retry queued' };
  });
}
