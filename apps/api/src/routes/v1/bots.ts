import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BOT_SCOPES } from '@hq/auth/types';
import {
  createBot,
  createBotKey,
  createServiceContext,
  deleteBot,
  getBot,
  listBotKeys,
  listBots,
  revokeBotKey,
  updateBot,
} from '@hq/services';
import { ApiError } from '../../lib/errors';
import { requireAuth, requireUser } from '../../lib/auth';

const botIdParamsSchema = z.object({
  botId: z.string().min(1),
});

const botKeyParamsSchema = z.object({
  botId: z.string().min(1),
  keyId: z.string().min(1),
});

function parseBody<T>(input: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid request payload.', parsed.error.flatten());
  }

  return parsed.data;
}

export async function registerBotsRoutes(app: FastifyInstance) {
  app.get('/v1/bots', async (request) => {
    const actor = await requireAuth(request, { botScope: 'content.read' });
    const context = createServiceContext(actor);
    return listBots(context);
  });

  app.post('/v1/bots', async (request) => {
    const actor = await requireUser(request);
    const context = createServiceContext(actor);
    const body = parseBody(
      request.body,
      z.object({
        name: z.string().min(2).max(80),
        description: z.string().max(280).optional(),
        scopes: z.array(z.enum(BOT_SCOPES)).optional(),
      })
    );

    return createBot(context, body);
  });

  app.get('/v1/bots/:botId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'content.read' });
    const context = createServiceContext(actor);
    const params = botIdParamsSchema.parse(request.params);
    return getBot(context, params.botId);
  });

  app.patch('/v1/bots/:botId', async (request) => {
    const actor = await requireUser(request);
    const context = createServiceContext(actor);
    const params = botIdParamsSchema.parse(request.params);
    const body = parseBody(
      request.body,
      z.object({
        name: z.string().min(2).max(80).optional(),
        description: z.string().max(280).nullable().optional(),
        scopes: z.array(z.enum(BOT_SCOPES)).optional(),
      })
    );

    return updateBot(context, { botId: params.botId, ...body });
  });

  app.delete('/v1/bots/:botId', async (request, reply) => {
    const actor = await requireUser(request);
    const context = createServiceContext(actor);
    const params = botIdParamsSchema.parse(request.params);
    await deleteBot(context, params.botId);
    return reply.code(204).send();
  });

  app.get('/v1/bots/:botId/keys', async (request) => {
    const actor = await requireAuth(request, { botScope: 'content.read' });
    const context = createServiceContext(actor);
    const params = botIdParamsSchema.parse(request.params);
    return listBotKeys(context, params.botId);
  });

  app.post('/v1/bots/:botId/keys', async (request) => {
    const actor = await requireAuth(request, { botScope: 'content.write' });
    const context = createServiceContext(actor);
    const params = botIdParamsSchema.parse(request.params);
    const body = parseBody(
      request.body,
      z.object({
        label: z.string().min(1).max(60).optional(),
      })
    );

    return createBotKey(context, { botId: params.botId, label: body.label });
  });

  app.post('/v1/bots/:botId/keys/:keyId/revoke', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'content.write' });
    const context = createServiceContext(actor);
    const params = botKeyParamsSchema.parse(request.params);

    await revokeBotKey(context, { botId: params.botId, keyId: params.keyId });

    return reply.code(204).send();
  });
}
