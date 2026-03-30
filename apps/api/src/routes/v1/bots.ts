import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BOT_SCOPES } from '@hq/auth/types';
import {
  addBotMember,
  createBot,
  createBotKey,
  createServiceContext,
  getBot,
  listBotKeys,
  listBots,
  removeBotMember,
  revokeBotKey,
  updateBot,
  updateBotMember,
} from '@hq/services';
import { ApiError } from '../../lib/errors';
import { requireAuth, requireUser } from '../../lib/auth';

const botIdParamsSchema = z.object({
  botId: z.string().min(1),
});

const botMemberParamsSchema = z.object({
  botId: z.string().min(1),
  userId: z.string().min(1),
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
    const bots = await listBots(context);
    return bots;
  });

  app.post('/v1/bots', async (request) => {
    const actor = await requireUser(request);
    const context = createServiceContext(actor);
    const body = parseBody(
      request.body,
      z.object({
        name: z.string().min(2).max(80),
        description: z.string().max(280).optional(),
      })
    );

    const created = await createBot(context, body);

    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      status: created.status,
    };
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
        status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
      })
    );

    const updated = await updateBot(context, {
      botId: params.botId,
      ...body,
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      status: updated.status,
    };
  });

  app.post('/v1/bots/:botId/members', async (request) => {
    const actor = await requireUser(request);
    const context = createServiceContext(actor);
    const params = botIdParamsSchema.parse(request.params);
    const body = parseBody(
      request.body,
      z.object({
        userEmail: z.email(),
        membershipRole: z.enum(['OWNER', 'MAINTAINER', 'VIEWER']),
      })
    );

    return addBotMember(context, {
      botId: params.botId,
      userEmail: body.userEmail,
      membershipRole: body.membershipRole,
    });
  });

  app.patch('/v1/bots/:botId/members/:userId', async (request) => {
    const actor = await requireUser(request);
    const context = createServiceContext(actor);
    const params = botMemberParamsSchema.parse(request.params);
    const body = parseBody(
      request.body,
      z.object({
        membershipRole: z.enum(['OWNER', 'MAINTAINER', 'VIEWER']),
      })
    );

    return updateBotMember(context, {
      botId: params.botId,
      userId: params.userId,
      membershipRole: body.membershipRole,
    });
  });

  app.delete('/v1/bots/:botId/members/:userId', async (request, reply) => {
    const actor = await requireUser(request);
    const context = createServiceContext(actor);
    const params = botMemberParamsSchema.parse(request.params);

    await removeBotMember(context, {
      botId: params.botId,
      userId: params.userId,
    });

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
        name: z.string().min(2).max(60),
        scopes: z.array(z.enum(BOT_SCOPES)).optional(),
        expiresAt: z.string().datetime().optional(),
      })
    );

    return createBotKey(context, {
      botId: params.botId,
      name: body.name,
      scopes: body.scopes ?? [],
      expiresAt: body.expiresAt,
    });
  });

  app.post('/v1/bots/:botId/keys/:keyId/revoke', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'content.write' });
    const context = createServiceContext(actor);
    const params = botKeyParamsSchema.parse(request.params);

    await revokeBotKey(context, {
      botId: params.botId,
      keyId: params.keyId,
    });

    return reply.code(204).send();
  });
}
