import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createServiceContext,
  listTasks,
  countTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  assignTask,
  markTaskBlocked,
  listBlockedTasks,
  listOverdueTasks,
} from '@hq/services';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

const taskIdParamsSchema = z.object({ taskId: z.string().min(1) });

const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  projectId: z.string().min(1).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeUserId: z.string().min(1).optional(),
  overdue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
  sortBy: z
    .enum(['title', 'status', 'priority', 'dueAt', 'createdAt', 'updatedAt'])
    .optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

const createBodySchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10_000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeUserId: z.string().min(1).optional(),
  dueAt: z.coerce.date().optional(),
  dueInDays: z.number().int().positive().optional(),
});

const updateBodySchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(10_000).nullable().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeUserId: z.string().min(1).nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  blockedReason: z.string().max(2000).nullable().optional(),
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

export async function registerTasksRoutes(app: FastifyInstance) {
  app.get('/v1/tasks', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.read' });
    const context = createServiceContext(actor);
    const query = parseQuery(request.query, listQuerySchema);
    return listTasks(context, query);
  });

  app.get('/v1/tasks/count', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.read' });
    const context = createServiceContext(actor);
    const query = parseQuery(
      request.query,
      z.object({
        projectId: z.string().min(1).optional(),
        status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
        assigneeUserId: z.string().min(1).optional(),
        overdue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
      })
    );
    const count = await countTasks(context, query);
    return { count };
  });

  app.get('/v1/tasks/blocked', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.read' });
    const context = createServiceContext(actor);
    const query = parseQuery(
      request.query,
      z.object({
        projectId: z.string().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
    );
    return listBlockedTasks(context, query);
  });

  app.get('/v1/tasks/overdue', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.read' });
    const context = createServiceContext(actor);
    const query = parseQuery(
      request.query,
      z.object({
        projectId: z.string().min(1).optional(),
        assigneeUserId: z.string().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
    );
    return listOverdueTasks(context, query);
  });

  app.post('/v1/tasks', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.write' });
    const context = createServiceContext(actor);
    const body = parseBody(request.body, createBodySchema);
    return createTask(context, body);
  });

  app.get('/v1/tasks/:taskId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.read' });
    const context = createServiceContext(actor);
    const { taskId } = taskIdParamsSchema.parse(request.params);
    return getTask(context, taskId);
  });

  app.patch('/v1/tasks/:taskId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.write' });
    const context = createServiceContext(actor);
    const { taskId } = taskIdParamsSchema.parse(request.params);
    const body = parseBody(request.body, updateBodySchema);
    return updateTask(context, { taskId, ...body });
  });

  app.delete('/v1/tasks/:taskId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.delete' });
    const context = createServiceContext(actor);
    const { taskId } = taskIdParamsSchema.parse(request.params);
    return deleteTask(context, taskId);
  });

  app.post('/v1/tasks/:taskId/complete', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.write' });
    const context = createServiceContext(actor);
    const { taskId } = taskIdParamsSchema.parse(request.params);
    return completeTask(context, taskId);
  });

  app.post('/v1/tasks/:taskId/assign', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.write' });
    const context = createServiceContext(actor);
    const { taskId } = taskIdParamsSchema.parse(request.params);
    const body = parseBody(
      request.body,
      z.object({ assigneeUserId: z.string().min(1).nullable() })
    );
    return assignTask(context, taskId, body.assigneeUserId);
  });

  app.post('/v1/tasks/:taskId/block', async (request) => {
    const actor = await requireAuth(request, { botScope: 'task.write' });
    const context = createServiceContext(actor);
    const { taskId } = taskIdParamsSchema.parse(request.params);
    const body = parseBody(
      request.body,
      z.object({ reason: z.string().trim().min(1).max(2000) })
    );
    return markTaskBlocked(context, taskId, body.reason);
  });
}
