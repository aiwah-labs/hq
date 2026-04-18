import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createServiceContext } from '@hq/services';
import {
  listIntegrations,
  listConnections,
  createConnection,
  deleteConnection,
  updateConnection,
  startOAuthFlow,
  completeOAuthFlow,
  OAuthStateError,
  OAuthTokenError,
} from '@hq/integrations';
import { hasPermission } from '@hq/auth/policy';
import { ApiError } from '../../lib/errors.js';
import { requireUser } from '../../lib/auth.js';

export async function registerIntegrationRoutes(app: FastifyInstance) {
  /**
   * List all registered integrations with connection status for the caller.
   * This is the main entry point for the Workshop `/settings/integrations`
   * page.
   */
  app.get('/v1/integrations', async (request) => {
    const principal = await requireUser(request);
    if (!hasPermission(principal, 'integrations.view')) {
      throw new ApiError(403, 'FORBIDDEN', "Missing permission 'integrations.view'.");
    }
    const ctx = createServiceContext(principal);
    const defs = listIntegrations();
    const connections = await listConnections(ctx);
    const byKey = new Map<string, typeof connections>();
    for (const conn of connections) {
      const list = byKey.get(conn.integrationKey) ?? [];
      list.push(conn);
      byKey.set(conn.integrationKey, list);
    }
    const items = defs.map((def) => ({
      key: def.key,
      name: def.name,
      description: def.description,
      icon: def.icon,
      scope: def.scope,
      multiplicity: def.multiplicity,
      authKind: def.auth.kind,
      docsUrl: def.docsUrl,
      connections: byKey.get(def.key) ?? [],
    }));
    return { items };
  });

  /** Create a static-credentials connection (OAuth goes through /oauth/start). */
  app.post('/v1/integrations/:key/connections', async (request) => {
    const principal = await requireUser(request);
    const { key } = z.object({ key: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        label: z.string().min(1),
        credentials: z.record(z.unknown()),
        metadata: z.record(z.unknown()).optional(),
        allowedUserIds: z.array(z.string()).optional(),
        allowedRoles: z.array(z.string()).optional(),
        userId: z.string().optional(),
      })
      .parse(request.body);
    const ctx = createServiceContext(principal);
    const created = await createConnection(ctx, { integrationKey: key, ...body });
    return { id: created.id, integrationKey: created.integrationKey, label: created.label };
  });

  app.delete('/v1/integrations/connections/:id', async (request) => {
    const principal = await requireUser(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const ctx = createServiceContext(principal);
    await deleteConnection(ctx, id);
    return { ok: true };
  });

  app.patch('/v1/integrations/connections/:id', async (request) => {
    const principal = await requireUser(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        label: z.string().min(1).optional(),
        allowedUserIds: z.array(z.string()).optional(),
        allowedRoles: z.array(z.string()).optional(),
      })
      .parse(request.body);
    const ctx = createServiceContext(principal);
    const updated = await updateConnection(ctx, { id, ...body });
    return { id: updated.id };
  });

  /** Start an OAuth flow — returns the URL the browser should redirect to. */
  app.post('/v1/integrations/:key/oauth/start', async (request) => {
    const principal = await requireUser(request);
    const { key } = z.object({ key: z.string().min(1) }).parse(request.params);
    const body = z
      .object({ redirectUri: z.string().url(), label: z.string().min(1).optional() })
      .parse(request.body);
    const ctx = createServiceContext(principal);
    const out = await startOAuthFlow(ctx, { integrationKey: key, ...body });
    return out;
  });

  /**
   * Complete an OAuth flow. Typically called by a browser-side callback page
   * that received the `code` and `state` from the provider and forwards them
   * to the API. Kept as a JSON endpoint so the callback page can handle UX
   * concerns (success messages, auto-close popup) without redirects.
   */
  app.post('/v1/integrations/oauth/complete', async (request) => {
    const principal = await requireUser(request);
    const body = z
      .object({
        state: z.string().min(1),
        code: z.string().min(1),
        redirectUri: z.string().url(),
      })
      .parse(request.body);
    const ctx = createServiceContext(principal);
    try {
      const out = await completeOAuthFlow(ctx, body);
      return out;
    } catch (err) {
      if (err instanceof OAuthStateError) {
        throw new ApiError(400, 'OAUTH_STATE_INVALID', err.message);
      }
      if (err instanceof OAuthTokenError) {
        throw new ApiError(502, 'OAUTH_TOKEN_ERROR', err.message, { providerStatus: err.status });
      }
      throw err;
    }
  });
}
