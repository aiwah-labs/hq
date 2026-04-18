import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../lib/auth';
import { ApiError } from '../../lib/errors';
import { createServiceContext } from '@hq/services';
import { checkHealth, getDiagnostics } from '@hq/services';
import { can } from '@hq/auth/policy';

export async function registerRuntimeRoutes(app: FastifyInstance) {
  app.get('/v1/runtime/whoami', async (request) => {
    const principal = await requireAuth(request);
    return { principal, scopes: principal.scopes };
  });

  // Public health check — no auth required so load balancers and uptime monitors can probe it.
  app.get('/v1/runtime/health', async () => {
    const systemPrincipal = {
      kind: 'bot' as const,
      source: 'apikey' as const,
      botId: 'system',
      botName: 'System',
      apiKeyId: '',
      scopes: [],
      permissions: {} as any,
    };
    const ctx = createServiceContext(systemPrincipal);
    return checkHealth(ctx);
  });

  // Diagnostics — requires admin.surface permission.
  app.get('/v1/runtime/diagnostics', async (request) => {
    const principal = await requireAuth(request);
    const decision = can(principal, { permission: 'admin.surface' });
    if (!decision.allowed) {
      throw new ApiError(403, 'FORBIDDEN', 'Admin surface access required.');
    }
    const ctx = createServiceContext(principal);
    return getDiagnostics(ctx);
  });
}
