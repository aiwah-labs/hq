import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registry, serializeAction } from '@hq/actions';
import { db } from '@hq/db';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

export async function registerActionRoutes(app: FastifyInstance) {
  // List all registered actions
  app.get('/v1/actions', async (request) => {
    await requireAuth(request, {});
    return {
      actions: registry.list().map((a) => ({
        name: a.name,
        title: a.title,
        description: a.description,
        category: a.category,
        objects: a.objects,
        resources: a.resources,
        scopes: a.scopes,
      })),
    };
  });

  // Action detail (includes JSON Schema for parameters)
  app.get('/v1/actions/:name', async (request) => {
    await requireAuth(request, {});
    const { name } = z.object({ name: z.string().min(1) }).parse(request.params);
    const action = registry.get(name);
    if (!action) throw new ApiError(404, 'NOT_FOUND', `Unknown action: ${name}`);
    return serializeAction(action);
  });

  // Parameters JSON Schema only
  app.get('/v1/actions/:name/schema', async (request) => {
    await requireAuth(request, {});
    const { name } = z.object({ name: z.string().min(1) }).parse(request.params);
    const action = registry.get(name);
    if (!action) throw new ApiError(404, 'NOT_FOUND', `Unknown action: ${name}`);
    return serializeAction(action).parameters;
  });

  // Execute a named action
  app.post('/v1/actions/:name', async (request) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(request.params);

    const action = registry.get(name);
    if (!action) throw new ApiError(404, 'NOT_FOUND', `Unknown action: ${name}`);

    const actor = await requireAuth(request, { botScope: action.scopes[0] });

    const parsed = action.parameters.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError(400, 'BAD_REQUEST', 'Invalid action parameters.', parsed.error.flatten());
    }

    const ctx = {
      db,
      principal: { type: actor.type, id: actor.id, scopes: actor.scopes ?? [] },
    };

    return action.handler(parsed.data, ctx);
  });
}
