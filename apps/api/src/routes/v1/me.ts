import type { FastifyInstance } from 'fastify';
import { db } from '@hq/db';
import { resolveCapabilities, resolveObjectAccess } from '@hq/auth/policy';
import { objects } from '@hq/objects';
import { requireAuth } from '../../lib/auth';

export async function registerMeRoute(app: FastifyInstance) {
  app.get('/v1/me', async (request) => {
    const principal = await requireAuth(request);

    return {
      authenticated: true,
      principal,
    };
  });

  /**
   * Resolved capability snapshot for the current principal. Clients use this to
   * gate UI (e.g. "show the delete button?") without duplicating the policy
   * engine on the frontend. Returns platform permissions, raw scopes, and a
   * per-object access level map.
   */
  app.get('/v1/me/permissions', async (request) => {
    const principal = await requireAuth(request);
    const cap = resolveCapabilities(principal);

    const objectAccess: Record<string, { read: string; create: string; update: string; delete: string; bulk: string }> = {};
    for (const [name] of Object.entries(objects)) {
      objectAccess[name] = {
        read: resolveObjectAccess(principal, name, 'read'),
        create: resolveObjectAccess(principal, name, 'create'),
        update: resolveObjectAccess(principal, name, 'update'),
        delete: resolveObjectAccess(principal, name, 'delete'),
        bulk: resolveObjectAccess(principal, name, 'bulk'),
      };
    }

    return {
      kind: cap.kind,
      effectiveRole: cap.effectiveRole,
      isSuperadmin: cap.isSuperadmin ?? false,
      permissions: cap.permissions,
      scopes: cap.scopes,
      objectAccess,
    };
  });

  // User search — used by messaging modal to find users to DM/add to group
  app.get('/v1/users', async (request) => {
    await requireAuth(request);
    const { q, limit = '20' } = request.query as { q?: string; limit?: string };

    const users = await db.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true },
      take: Math.min(parseInt(limit, 10) || 20, 50),
      orderBy: { name: 'asc' },
    });

    return users;
  });
}
