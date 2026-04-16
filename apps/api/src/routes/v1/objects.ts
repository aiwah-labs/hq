import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  objects,
  objectList,
  objectCount,
  objectGet,
  objectCreate,
  objectUpdate,
  objectDelete,
  objectBulkUpdate,
  objectBulkDelete,
  getObjectSchema,
  listObjectSchemas,
} from '@hq/objects';
import { createServiceContext } from '@hq/services';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

const typeParamSchema = z.object({ type: z.string().min(1) });
const idParamSchema = z.object({ type: z.string().min(1), id: z.string().min(1) });

const listQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  include: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',').map((s) => s.trim()).filter(Boolean)))
    .optional(),
});

const countQuerySchema = z.object({
  q: z.string().optional(),
});

function getObjectDef(type: string) {
  const def = objects[type];
  if (!def) throw new ApiError(404, 'NOT_FOUND', `Unknown object type: ${type}`);
  return def;
}

export async function registerObjectRoutes(app: FastifyInstance) {
  // List registered object types (serialized schemas)
  app.get('/v1/objects', async (request) => {
    await requireAuth(request, {});
    return { objects: listObjectSchemas() };
  });

  // Object schema (detailed metadata for a single object type)
  app.get('/v1/objects/:type/schema', async (request) => {
    await requireAuth(request, {});
    const { type } = typeParamSchema.parse(request.params);
    const schema = getObjectSchema(type);
    if (!schema) throw new ApiError(404, 'NOT_FOUND', `Unknown object type: ${type}`);
    return schema;
  });

  // Count records
  app.get('/v1/objects/:type/count', async (request) => {
    const { type } = typeParamSchema.parse(request.params);
    const def = getObjectDef(type);
    const actor = await requireAuth(request, { botScope: def.scopes.read });
    const ctx = createServiceContext(actor);
    const query = countQuerySchema.parse(request.query);
    const count = await objectCount(type, query, ctx);
    return { count };
  });

  // List records of a given type
  app.get('/v1/objects/:type', async (request) => {
    const { type } = typeParamSchema.parse(request.params);
    const def = getObjectDef(type);
    const actor = await requireAuth(request, { botScope: def.scopes.read });
    const ctx = createServiceContext(actor);
    const query = listQuerySchema.parse(request.query);
    return objectList(type, query, ctx);
  });

  // Bulk update records
  app.post('/v1/objects/:type/bulk-update', async (request) => {
    const { type } = typeParamSchema.parse(request.params);
    const def = getObjectDef(type);
    const actor = await requireAuth(request, { botScope: def.scopes.write });
    const ctx = createServiceContext(actor);
    const items = z.array(z.object({ id: z.string() }).passthrough()).parse(request.body);
    return objectBulkUpdate(type, items as Array<{ id: string } & Record<string, unknown>>, ctx);
  });

  // Bulk delete records
  app.post('/v1/objects/:type/bulk-delete', async (request) => {
    const { type } = typeParamSchema.parse(request.params);
    const def = getObjectDef(type);
    const actor = await requireAuth(request, { botScope: def.scopes.delete ?? def.scopes.write });
    const ctx = createServiceContext(actor);
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(request.body);
    return objectBulkDelete(type, ids, ctx);
  });

  // Get one record
  app.get('/v1/objects/:type/:id', async (request) => {
    const { type, id } = idParamSchema.parse(request.params);
    const def = getObjectDef(type);
    const actor = await requireAuth(request, { botScope: def.scopes.read });
    const ctx = createServiceContext(actor);
    return objectGet(type, id, ctx);
  });

  // Create a record
  app.post('/v1/objects/:type', async (request) => {
    const { type } = typeParamSchema.parse(request.params);
    const def = getObjectDef(type);
    const actor = await requireAuth(request, { botScope: def.scopes.write });
    const ctx = createServiceContext(actor);
    return objectCreate(type, request.body as Record<string, unknown>, ctx);
  });

  // Update a record
  app.patch('/v1/objects/:type/:id', async (request) => {
    const { type, id } = idParamSchema.parse(request.params);
    const def = getObjectDef(type);
    const actor = await requireAuth(request, { botScope: def.scopes.write });
    const ctx = createServiceContext(actor);
    return objectUpdate(type, id, request.body as Record<string, unknown>, ctx);
  });

  // Delete a record
  app.delete('/v1/objects/:type/:id', async (request) => {
    const { type, id } = idParamSchema.parse(request.params);
    const def = getObjectDef(type);
    const actor = await requireAuth(request, { botScope: def.scopes.delete ?? def.scopes.write });
    const ctx = createServiceContext(actor);
    await objectDelete(type, id, ctx);
    return { success: true };
  });
}
