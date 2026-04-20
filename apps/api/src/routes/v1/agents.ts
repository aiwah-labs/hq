import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@hq/db';
import { scheduleJob } from '@hq/jobs';
import { listAgents, getAgent, skillRegistry } from '@hq/agents';
import { objects } from '@hq/objects';
import { ApiError } from '../../lib/errors.js';
import { requireUser } from '../../lib/auth.js';

function parseBody<T>(input: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid request payload.', parsed.error.flatten());
  }
  return parsed.data;
}

export async function registerAgentRoutes(app: FastifyInstance) {
  // GET /v1/skills — list all registered skills (capabilities reference)
  app.get('/v1/skills', async (request) => {
    await requireUser(request);
    return skillRegistry.list();
  });

  // GET /v1/capabilities/objects — list registered object types for capabilities reference
  app.get('/v1/capabilities/objects', async (request) => {
    await requireUser(request);
    return Object.entries(objects).map(([name, def]) => ({
      name,
      label: def.label,
      pluralLabel: def.pluralLabel,
      readActions: [`${name.toLowerCase()}.list`, `${name.toLowerCase()}.get`, `${name.toLowerCase()}.count`],
      writeActions: [`${name.toLowerCase()}.create`, `${name.toLowerCase()}.update`, `${name.toLowerCase()}.delete`],
    }));
  });

  // GET /v1/agents — registry list + run counts
  app.get('/v1/agents', async (request) => {
    await requireUser(request);
    const agents = listAgents();

    const runCounts = await db.agentRun.groupBy({
      by: ['agentKey'],
      _count: { id: true },
    });
    const runCountMap = new Map(runCounts.map((r) => [r.agentKey, r._count.id]));

    return agents.map((def) => ({
      key: def.key,
      name: def.name,
      description: def.description,
      model: def.model,
      maxSteps: def.maxSteps ?? 20,
      triggers: def.defaultTriggers,
      scopes: def.scopes,
      runCount: runCountMap.get(def.key) ?? 0,
      enabled: true,
    }));
  });

  // GET /v1/agents/:key — agent detail + recent runs
  app.get('/v1/agents/:key', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };

    const def = getAgent(key);
    if (!def) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    const recentRuns = await db.agentRun.findMany({
      where: { agentKey: key },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: { id: true, trigger: true, status: true, startedAt: true, finishedAt: true },
    });

    return {
      key: def.key,
      name: def.name,
      description: def.description,
      model: def.model,
      maxSteps: def.maxSteps ?? 20,
      triggers: def.defaultTriggers,
      scopes: def.scopes,
      enabled: true,
      recentRuns,
    };
  });

  // POST /v1/agents/:key/enable — enable agent (persisted per-instance in future; no-op for now)
  app.post('/v1/agents/:key/enable', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');
    return { ok: true };
  });

  // POST /v1/agents/:key/disable — disable agent
  app.post('/v1/agents/:key/disable', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');
    return { ok: true };
  });

  // POST /v1/agents/:key/message — queue an agent run
  app.post('/v1/agents/:key/message', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };

    const def = getAgent(key);
    if (!def) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    const body = parseBody(
      request.body,
      z.object({
        text: z.string().optional(),
        runId: z.string().optional(),
      })
    );

    await scheduleJob('agent.run', {
      agentKey: key,
      trigger: {
        type: 'message',
        text: body.text ?? 'Manual trigger',
        mode: 'mention',
        ...(body.runId && { runId: body.runId }),
      },
    });

    return { ok: true, message: 'Agent run queued' };
  });

  // GET /v1/agents/:key/threads — list agent threads (runs with message context)
  app.get('/v1/agents/:key/threads', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    const query = request.query as { cursor?: string; limit?: string };
    const limit = Math.min(100, parseInt(query.limit ?? '20'));

    const runs = await db.agentRun.findMany({
      where: { agentKey: key },
      orderBy: { startedAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        status: true,
        trigger: true,
        inputData: true,
        outputData: true,
        startedAt: true,
        finishedAt: true,
        steps: { select: { id: true, type: true, createdAt: true } },
      },
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });

    const hasMore = runs.length > limit;
    const data = hasMore ? runs.slice(0, limit) : runs;

    return {
      data: data.map((r) => ({
        id: r.id,
        status: r.status,
        channelRef: (r.trigger as Record<string, unknown>)?.channelRef ?? null,
        messages: r.steps,
        updatedAt: r.finishedAt ?? r.startedAt,
      })),
      nextCursor: hasMore ? data[data.length - 1]?.id : null,
    };
  });

  // GET /v1/agents/:key/threads/:threadId — single thread detail
  app.get('/v1/agents/:key/threads/:threadId', async (request) => {
    await requireUser(request);
    const { key, threadId } = request.params as { key: string; threadId: string };

    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    const run = await db.agentRun.findUnique({
      where: { id: threadId },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
    if (!run || run.agentKey !== key) throw new ApiError(404, 'NOT_FOUND', 'Thread not found');

    const stepData = run.steps.map((s) => {
      const data = s.data as Record<string, unknown>;
      return {
        role: s.type === 'tool' ? 'tool' : 'assistant',
        content: data,
        createdAt: s.createdAt,
      };
    });

    return {
      id: run.id,
      status: run.status,
      channelRef: (run.trigger as unknown as Record<string, unknown>)?.channelRef ?? null,
      messages: stepData,
      summary: null,
      metadata: {},
      updatedAt: run.finishedAt ?? run.startedAt,
    };
  });

  // GET /v1/agents/:key/runs — paginated run list
  app.get('/v1/agents/:key/runs', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    const query = request.query as { cursor?: string; limit?: string };
    const limit = Math.min(100, parseInt(query.limit ?? '50'));

    const runs = await db.agentRun.findMany({
      where: { agentKey: key },
      orderBy: { startedAt: 'desc' },
      take: limit + 1,
      select: { id: true, trigger: true, status: true, inputData: true, outputData: true, error: true, startedAt: true, finishedAt: true },
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });

    const hasMore = runs.length > limit;
    const data = hasMore ? runs.slice(0, limit) : runs;
    return {
      data,
      nextCursor: hasMore ? data[data.length - 1]?.id : null,
    };
  });

  // GET /v1/agents/:key/runs/:id — single run with steps
  app.get('/v1/agents/:key/runs/:id', async (request) => {
    await requireUser(request);
    const { key, id } = request.params as { key: string; id: string };

    const run = await db.agentRun.findUnique({
      where: { id },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
    if (!run || run.agentKey !== key) throw new ApiError(404, 'NOT_FOUND', 'Run not found');
    return run;
  });
}
