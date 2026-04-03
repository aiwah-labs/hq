// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import type { FastifyInstance } from 'fastify';
import { db } from '@hq/db';
import { requireAuth } from '../../lib/auth';

export async function registerMeRoute(app: FastifyInstance) {
  app.get('/v1/me', async (request) => {
    const principal = await requireAuth(request);

    return {
      authenticated: true,
      principal,
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
