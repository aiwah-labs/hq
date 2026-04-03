// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@hq/db';
import { scheduleJob } from '@hq/jobs';
import { getAgents, getAgent, skillRegistry } from '@hq/agents';
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

  // GET /v1/objects — list registered object types for capabilities reference
  app.get('/v1/objects', async (request) => {
    await requireUser(request);
    return Object.entries(objects).map(([name, def]) => ({
      name,
      label: def.label,
      pluralLabel: def.pluralLabel,
      readActions: [`${name.toLowerCase()}.list`, `${name.toLowerCase()}.get`, `${name.toLowerCase()}.count`],
      writeActions: [`${name.toLowerCase()}.create`, `${name.toLowerCase()}.update`, `${name.toLowerCase()}.delete`],
    }));
  });

  // GET /v1/agents — registry list + enabled status + thread counts
  app.get('/v1/agents', async (request) => {
    await requireUser(request);
    const agents = getAgents();

    const configs = await db.agentConfig.findMany();
    const configMap = new Map(configs.map((c) => [c.agentKey, c]));

    const threadCounts = await db.agentThread.groupBy({
      by: ['agentKey'],
      _count: { id: true },
    });
    const threadCountMap = new Map(threadCounts.map((t) => [t.agentKey, t._count.id]));

    return agents.map((def) => {
      const config = configMap.get(def.key);
      return {
        key: def.key,
        name: def.name,
        description: def.description,
        model: def.model,
        enabled: config?.enabled ?? true,
        threadCount: threadCountMap.get(def.key) ?? 0,
        capabilityCount: def.capabilities.length,
        triggerCount: def.defaultTriggers.length,
        config: config?.config ?? {},
      };
    });
  });

  // GET /v1/agents/:key — agent detail + recent threads
  app.get('/v1/agents/:key', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };

    const def = getAgent(key);
    if (!def) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    const config = await db.agentConfig.findUnique({ where: { agentKey: key } });
    const recentThreads = await db.agentThread.findMany({
      where: { agentKey: key },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, channelRef: true, status: true, metadata: true, createdAt: true, updatedAt: true },
    });

    return {
      key: def.key,
      name: def.name,
      description: def.description,
      model: def.model,
      capabilities: def.capabilities,
      defaultTriggers: def.defaultTriggers,
      channelBehavior: def.channelBehavior,
      compaction: def.compaction,
      enabled: config?.enabled ?? true,
      config: config?.config ?? {},
      recentThreads,
    };
  });

  // POST /v1/agents/:key/enable
  app.post('/v1/agents/:key/enable', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    await db.agentConfig.upsert({
      where: { agentKey: key },
      create: { agentKey: key, enabled: true },
      update: { enabled: true },
    });
    return { ok: true };
  });

  // POST /v1/agents/:key/disable
  app.post('/v1/agents/:key/disable', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    await db.agentConfig.upsert({
      where: { agentKey: key },
      create: { agentKey: key, enabled: false },
      update: { enabled: false },
    });
    return { ok: true };
  });

  // PATCH /v1/agents/:key/config
  app.patch('/v1/agents/:key/config', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    const body = parseBody(request.body, z.object({}).passthrough());

    await db.agentConfig.upsert({
      where: { agentKey: key },
      create: { agentKey: key, config: body as object },
      update: { config: body as object },
    });
    return { ok: true };
  });

  // POST /v1/agents/:key/message — manual trigger
  app.post('/v1/agents/:key/message', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };

    const def = getAgent(key);
    if (!def) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    const body = parseBody(
      request.body,
      z.object({
        text: z.string().optional(),
        threadId: z.string().optional(),
      })
    );

    await scheduleJob('agent.run', {
      agentKey: key,
      trigger: {
        type: 'message',
        text: body.text ?? 'Manual trigger',
        mode: 'mention',
        ...(body.threadId && { threadId: body.threadId }),
      },
    });

    return { ok: true, message: 'Agent turn queued' };
  });

  // GET /v1/agents/:key/threads — paginated thread list
  app.get('/v1/agents/:key/threads', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    const query = request.query as { cursor?: string; limit?: string };
    const limit = Math.min(100, parseInt(query.limit ?? '50'));

    const threads = await db.agentThread.findMany({
      where: { agentKey: key },
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
      select: { id: true, channelRef: true, status: true, metadata: true, summary: true, createdAt: true, updatedAt: true },
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });

    const hasMore = threads.length > limit;
    const data = hasMore ? threads.slice(0, limit) : threads;
    return {
      data,
      nextCursor: hasMore ? data[data.length - 1]?.id : null,
    };
  });

  // GET /v1/agents/:key/threads/:id — single thread with full message history
  app.get('/v1/agents/:key/threads/:id', async (request) => {
    await requireUser(request);
    const { key, id } = request.params as { key: string; id: string };

    const thread = await db.agentThread.findUnique({
      where: { id, agentKey: key },
    });
    if (!thread) throw new ApiError(404, 'NOT_FOUND', 'Thread not found');
    return thread;
  });

  // DELETE /v1/agents/:key/threads/:id — archive thread
  app.delete('/v1/agents/:key/threads/:id', async (request) => {
    await requireUser(request);
    const { key, id } = request.params as { key: string; id: string };

    const thread = await db.agentThread.findUnique({ where: { id, agentKey: key } });
    if (!thread) throw new ApiError(404, 'NOT_FOUND', 'Thread not found');

    await db.agentThread.update({
      where: { id },
      data: { status: 'archived' },
    });
    return { ok: true };
  });

  // GET /v1/agents/:key/channel-subs — list channel subscriptions
  app.get('/v1/agents/:key/channel-subs', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');
    return db.agentChannelSub.findMany({ where: { agentKey: key } });
  });

  // POST /v1/agents/:key/channel-subs — create channel subscription
  app.post('/v1/agents/:key/channel-subs', async (request) => {
    await requireUser(request);
    const { key } = request.params as { key: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    const body = parseBody(
      request.body,
      z.object({ channelId: z.string().min(1) })
    );

    return db.agentChannelSub.upsert({
      where: { agentKey_channelId: { agentKey: key, channelId: body.channelId } },
      create: { agentKey: key, channelId: body.channelId },
      update: {},
    });
  });

  // DELETE /v1/agents/:key/channel-subs/:subId — remove channel subscription
  app.delete('/v1/agents/:key/channel-subs/:subId', async (request) => {
    await requireUser(request);
    const { key, subId } = request.params as { key: string; subId: string };
    if (!getAgent(key)) throw new ApiError(404, 'NOT_FOUND', 'Agent not found');

    await db.agentChannelSub.delete({ where: { id: subId } });
    return { ok: true };
  });
}
