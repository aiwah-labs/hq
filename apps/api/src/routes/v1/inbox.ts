import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createServiceContext } from '@hq/services';
import { listInbox, markRead, archiveItem, markAllRead } from '@hq/services';
import { ApiError } from '../../lib/errors.js';
import { requireAuth, requireUser } from '../../lib/auth.js';

export async function registerInboxRoutes(app: FastifyInstance) {
  app.get('/v1/inbox', async (request) => {
    const principal = await requireUser(request);
    const ctx = createServiceContext(principal);
    const query = z.object({
      status: z.enum(['UNREAD', 'READ', 'ARCHIVED']).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(request.query);
    const items = await listInbox(ctx, { status: query.status, limit: query.limit });
    return { items };
  });

  app.post('/v1/inbox/:id/read', async (request) => {
    const principal = await requireUser(request);
    const ctx = createServiceContext(principal);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const item = await markRead(ctx, id);
    return { item };
  });

  app.post('/v1/inbox/:id/archive', async (request) => {
    const principal = await requireUser(request);
    const ctx = createServiceContext(principal);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const item = await archiveItem(ctx, id);
    return { item };
  });

  app.post('/v1/inbox/read-all', async (request) => {
    const principal = await requireUser(request);
    const ctx = createServiceContext(principal);
    const result = await markAllRead(ctx);
    return { updated: result.count };
  });
}
