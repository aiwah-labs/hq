import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createNote, createServiceContext, deleteNote, getNote, listNotes, updateNote } from '@hq/services';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

const noteIdParamsSchema = z.object({ noteId: z.string().min(1) });

const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  tag: z.string().trim().min(1).max(80).optional(),
  isPinned: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const createBodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  body: z.string().max(500_000).optional(),
  slug: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  isPinned: z.boolean().optional(),
});

const updateBodySchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  body: z.string().max(500_000).optional(),
  slug: z.string().trim().min(1).max(200).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  isPinned: z.boolean().optional(),
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

export async function registerNotesRoutes(app: FastifyInstance) {
  app.get('/v1/notes', async (request) => {
    const actor = await requireAuth(request, { botScope: 'note.read' });
    const context = createServiceContext(actor);
    const query = parseQuery(request.query, listQuerySchema);
    return listNotes(context, { query: query.q, tag: query.tag, isPinned: query.isPinned, limit: query.limit });
  });

  app.post('/v1/notes', async (request) => {
    const actor = await requireAuth(request, { botScope: 'note.write' });
    const context = createServiceContext(actor);
    const body = parseBody(request.body, createBodySchema);
    return createNote(context, body);
  });

  app.get('/v1/notes/:noteId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'note.read' });
    const context = createServiceContext(actor);
    const { noteId } = noteIdParamsSchema.parse(request.params);
    return getNote(context, noteId);
  });

  app.patch('/v1/notes/:noteId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'note.write' });
    const context = createServiceContext(actor);
    const { noteId } = noteIdParamsSchema.parse(request.params);
    const body = parseBody(request.body, updateBodySchema);
    return updateNote(context, { noteId, ...body });
  });

  app.delete('/v1/notes/:noteId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'note.delete' });
    const context = createServiceContext(actor);
    const { noteId } = noteIdParamsSchema.parse(request.params);
    return deleteNote(context, noteId);
  });
}
