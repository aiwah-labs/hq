import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createContent, createServiceContext, getContent, listContent, publishContent, updateContent } from '@hq/services';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

const contentIdParamsSchema = z.object({
  contentId: z.string().min(1),
});

const attachmentSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
    type: z.string().trim().min(1).max(64).optional(),
    mimeType: z.string().trim().min(1).max(120).optional(),
    caption: z.string().trim().min(1).max(240).optional(),
  })
  .passthrough();

const createContentBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().max(40000).optional(),
  attachments: z.array(attachmentSchema).optional(),
  status: z.string().trim().min(1).max(64).optional(),
  platform: z.string().trim().min(1).max(80).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  externalUrl: z.string().trim().min(1).max(2048).optional(),
});

const updateContentBodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  text: z.string().max(40000).optional(),
  attachments: z.array(attachmentSchema).optional(),
  status: z.string().trim().min(1).max(64).optional(),
  platform: z.string().trim().min(1).max(80).nullable().optional(),
  source: z.string().trim().min(1).max(80).nullable().optional(),
  externalUrl: z.string().trim().min(1).max(2048).nullable().optional(),
});

const publishContentBodySchema = z.object({
  externalUrl: z.string().trim().min(1).max(2048).nullable().optional(),
});

const listContentQuerySchema = z.object({
  status: z.string().trim().min(1).max(64).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

function parseBody<T>(input: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid request payload.', parsed.error.flatten());
  }

  return parsed.data;
}

function parseQuery<T>(input: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid query parameters.', parsed.error.flatten());
  }

  return parsed.data;
}

export async function registerContentRoutes(app: FastifyInstance) {
  app.get('/v1/content', async (request) => {
    const actor = await requireAuth(request, { botScope: 'content.read' });
    const context = createServiceContext(actor);
    const query = parseQuery(request.query, listContentQuerySchema);

    return listContent(context, {
      status: query.status,
      query: query.q,
      limit: query.limit,
    });
  });

  app.post('/v1/content', async (request) => {
    const actor = await requireAuth(request, { botScope: 'content.write' });
    const context = createServiceContext(actor);
    const body = parseBody(request.body, createContentBodySchema);
    return createContent(context, body);
  });

  app.get('/v1/content/:contentId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'content.read' });
    const context = createServiceContext(actor);
    const params = contentIdParamsSchema.parse(request.params);
    return getContent(context, params.contentId);
  });

  app.patch('/v1/content/:contentId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'content.write' });
    const context = createServiceContext(actor);
    const params = contentIdParamsSchema.parse(request.params);
    const body = parseBody(request.body, updateContentBodySchema);

    return updateContent(context, {
      contentId: params.contentId,
      ...body,
    });
  });

  app.post('/v1/content/:contentId/publish', async (request) => {
    const actor = await requireAuth(request, { botScope: 'content.publish' });
    const context = createServiceContext(actor);
    const params = contentIdParamsSchema.parse(request.params);
    const body = parseBody(request.body, publishContentBodySchema);

    return publishContent(context, {
      contentId: params.contentId,
      externalUrl: body.externalUrl,
    });
  });
}
