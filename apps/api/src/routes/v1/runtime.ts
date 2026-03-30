import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../lib/auth';

export async function registerRuntimeRoutes(app: FastifyInstance) {
  app.get('/v1/runtime/whoami', async (request) => {
    const principal = await requireAuth(request);

    return {
      principal,
      scopes: principal.scopes,
    };
  });
}
