import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createServiceContext,
  listProjects,
  countProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectStats,
} from '@hq/services';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

const projectIdParamsSchema = z.object({ projectId: z.string().min(1) });

const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  ownerUserId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
  sortBy: z
    .enum(['name', 'status', 'priority', 'startDate', 'targetDate', 'createdAt', 'updatedAt'])
    .optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(300),
  summary: z.string().max(2000).optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'BLOCKED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  targetInDays: z.number().int().positive().optional(),
  startDate: z.coerce.date().optional(),
  targetDate: z.coerce.date().optional(),
});

const updateBodySchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  summary: z.string().max(2000).nullable().optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  startDate: z.coerce.date().nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  ownerUserId: z.string().min(1).nullable().optional(),
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

export async function registerProjectsRoutes(app: FastifyInstance) {
  app.get('/v1/projects', async (request) => {
    const actor = await requireAuth(request, { botScope: 'project.read' });
    const context = createServiceContext(actor);
    const query = parseQuery(request.query, listQuerySchema);
    return listProjects(context, query);
  });

  app.get('/v1/projects/count', async (request) => {
    const actor = await requireAuth(request, { botScope: 'project.read' });
    const context = createServiceContext(actor);
    const query = parseQuery(
      request.query,
      z.object({
        q: z.string().trim().min(1).max(200).optional(),
        status: z.enum(['PLANNED', 'ACTIVE', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
        ownerUserId: z.string().min(1).optional(),
      })
    );
    const count = await countProjects(context, query);
    return { count };
  });

  app.post('/v1/projects', async (request) => {
    const actor = await requireAuth(request, { botScope: 'project.write' });
    const context = createServiceContext(actor);
    const body = parseBody(request.body, createBodySchema);
    return createProject(context, body);
  });

  app.get('/v1/projects/:projectId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'project.read' });
    const context = createServiceContext(actor);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    return getProject(context, projectId);
  });

  app.patch('/v1/projects/:projectId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'project.write' });
    const context = createServiceContext(actor);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const body = parseBody(request.body, updateBodySchema);
    return updateProject(context, { projectId, ...body });
  });

  app.delete('/v1/projects/:projectId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'project.delete' });
    const context = createServiceContext(actor);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    return deleteProject(context, projectId);
  });

  app.get('/v1/projects/:projectId/stats', async (request) => {
    const actor = await requireAuth(request, { botScope: 'project.read' });
    const context = createServiceContext(actor);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    return getProjectStats(context, projectId);
  });
}
