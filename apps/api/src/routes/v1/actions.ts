import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registry, serializeAction, dispatchAction } from '@hq/actions';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

export async function registerActionRoutes(app: FastifyInstance) {
  // List all registered actions (filtered to ones the caller can execute).
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

  // Execute a named action via the dispatcher (unified policy / validation).
  app.post('/v1/actions/:name', async (request, reply) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(request.params);
    const principal = await requireAuth(request);

    const outcome = await dispatchAction(name, request.body, principal);
    if (!outcome.ok) {
      throw new ApiError(
        outcome.status,
        outcome.code,
        outcome.message,
        'details' in outcome ? outcome.details : undefined,
      );
    }
    if ('pending' in outcome && outcome.pending) {
      reply.code(202);
      return {
        status: 'pending_approval',
        approvalRequestId: outcome.approvalRequestId,
        executionId: outcome.executionId,
        risk: outcome.risk,
        reason: outcome.reason,
      };
    }
    return {
      result: outcome.result,
      executionId: outcome.executionId,
      risk: outcome.risk,
    };
  });
}
