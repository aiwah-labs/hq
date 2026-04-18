/**
 * Activity / PlatformEvent read API.
 *
 * Surfaces the event stream written by the object runtime, action dispatcher,
 * workflow engine, agent runner, and approval flow. Callers use the timeline
 * to explain "what happened on this object / run / decision".
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@hq/db';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

const listQuerySchema = z.object({
  type: z.string().optional(),
  actorType: z.string().optional(),
  actorId: z.string().optional(),
  actionName: z.string().optional(),
  correlationId: z.string().optional(),
  objectType: z.string().optional(),
  objectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const objectParamsSchema = z.object({
  objectType: z.string().min(1),
  objectId: z.string().min(1),
});

export async function registerActivityRoutes(app: FastifyInstance) {
  app.get('/v1/activity', async (request) => {
    await requireAuth(request);
    const query = listQuerySchema.parse(request.query);
    const rows = await db.platformEvent.findMany({
      where: {
        type: query.type,
        actorType: query.actorType,
        actorId: query.actorId,
        actionName: query.actionName,
        correlationId: query.correlationId,
        objectType: query.objectType,
        objectId: query.objectId,
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return { events: rows };
  });

  app.get('/v1/activity/:objectType/:objectId', async (request) => {
    await requireAuth(request);
    const { objectType, objectId } = objectParamsSchema.parse(request.params);
    const rows = await db.platformEvent.findMany({
      where: { objectType, objectId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    if (rows.length === 0) {
      // Make it explicit when nothing happened for this object, but don't 404
      // — an empty timeline is a valid state.
      return { events: [] };
    }
    return { events: rows };
  });

  // Escape hatch so callers can fetch the recent events for a single
  // correlation id (e.g. a workflow run or approval request).
  app.get('/v1/activity/correlation/:id', async (request) => {
    await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const rows = await db.platformEvent.findMany({
      where: { correlationId: id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    if (rows.length === 0) throw new ApiError(404, 'NOT_FOUND', `No activity for correlation ${id}.`);
    return { events: rows };
  });
}
