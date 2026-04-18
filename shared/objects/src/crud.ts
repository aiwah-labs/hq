import { db } from '@hq/db';
import type { ServiceContext } from '@hq/services';
import { emitEvent } from '@hq/events';
import { assertCan, resolveObjectAccess, recordBelongsToUser } from '@hq/auth/policy';
import { objects } from './registry.js';
import { getObjectOwnership } from './permissions.js';
import type { ListParams, ObjectDefinition } from './types.js';

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function getModel(def: ObjectDefinition): any {
  return (db as any)[lowerFirst(def.model)];
}

function buildWhere(def: ObjectDefinition, params: ListParams): any {
  const where: any = {};

  // Filter by filterable fields
  if (params.filters) {
    for (const [key, field] of Object.entries(def.fields)) {
      if (field.filterable && params.filters[key] !== undefined) {
        where[key] = params.filters[key];
      }
    }
  }

  // Full-text search across searchable fields
  if (params.q) {
    where.OR = Object.entries(def.fields)
      .filter(([, f]) => f.searchable)
      .map(([key]) => ({ [key]: { contains: params.q, mode: 'insensitive' } }));
  }

  return where;
}

function buildInclude(def: ObjectDefinition, requestedIncludes?: string[]): any {
  const include: any = {};

  for (const [key, field] of Object.entries(def.fields)) {
    if (field.type !== 'relation') continue;

    if (field.kind === 'hasMany') {
      // Always include _count for hasMany relations
      include._count = include._count ?? { select: {} };
      include._count.select[key] = true;
    } else if (field.kind === 'belongsTo' && requestedIncludes?.includes(key)) {
      include[key] = true;
    }
  }

  return Object.keys(include).length > 0 ? include : undefined;
}

/**
 * Merge ownership-scoping filters into a Prisma `where` clause. When the
 * principal only has `own` access, we narrow to records whose owner/assignee/
 * extra field matches the acting user. Admins and object-level `all` grants
 * skip this entirely.
 */
function applyOwnershipWhere(def: ObjectDefinition, where: any, ctx: ServiceContext): any {
  if (ctx.actor.kind !== 'user') return where;
  const ownership = getObjectOwnership(def);
  if (!ownership) return where;
  const fields = [ownership.ownerField, ownership.assigneeField, ...(ownership.extraFields ?? [])]
    .filter((f): f is string => typeof f === 'string' && f.length > 0);
  if (fields.length === 0) return where;
  const userId = ctx.actor.userId;
  const ownershipOr = fields.map((f) => ({ [f]: userId }));
  if (where.OR && Array.isArray(where.OR)) {
    // Combine search OR with ownership OR via AND of two ORs.
    const existing = where.OR;
    const rest = { ...where };
    delete rest.OR;
    return { ...rest, AND: [{ OR: existing }, { OR: ownershipOr }] };
  }
  return { ...where, OR: ownershipOr };
}

export async function objectList(objectName: string, params: ListParams, ctx: ServiceContext): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

  // Reads: confirm the principal can read this object at all.
  assertCan(ctx.actor, { object: { type: objectName, op: 'read' } });
  const access = resolveObjectAccess(ctx.actor, objectName, 'read');

  const model = getModel(def);
  let where = buildWhere(def, params);
  if (access === 'own') where = applyOwnershipWhere(def, where, ctx);
  const include = buildInclude(def, params.include);
  const orderBy = params.sortBy
    ? { [params.sortBy]: params.sortDir ?? 'desc' }
    : { createdAt: 'desc' };

  const limit = params.limit ?? 50;
  const queryOptions: any = {
    where,
    include,
    orderBy,
    take: limit + 1,
  };
  if (params.cursor) {
    queryOptions.cursor = { id: params.cursor };
    queryOptions.skip = 1;
  }
  const items = await model.findMany(queryOptions);

  let nextCursor: string | null = null;
  if (items.length > limit) {
    items.pop();
    nextCursor = (items[items.length - 1] as { id: string }).id;
  }

  return { items, nextCursor };
}

export async function objectCount(objectName: string, params: Pick<ListParams, 'q' | 'filters'>, ctx: ServiceContext): Promise<number> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

  assertCan(ctx.actor, { object: { type: objectName, op: 'read' } });
  const access = resolveObjectAccess(ctx.actor, objectName, 'read');

  const model = getModel(def);
  let where = buildWhere(def, params);
  if (access === 'own') where = applyOwnershipWhere(def, where, ctx);
  return model.count({ where });
}

export async function objectGet(objectName: string, id: string, ctx: ServiceContext): Promise<unknown> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

  assertCan(ctx.actor, { object: { type: objectName, op: 'read' } });

  const model = getModel(def);

  // For get, include all relations (full detail view)
  const include: any = {};
  for (const [key, field] of Object.entries(def.fields)) {
    if (field.type !== 'relation') continue;
    if (field.kind === 'hasMany') {
      include[key] = { orderBy: { createdAt: 'desc' } };
    } else if (field.kind === 'belongsTo') {
      include[key] = true;
    }
  }

  const record = await model.findUnique({
    where: { id },
    include: Object.keys(include).length > 0 ? include : undefined,
  });

  if (!record) throw new Error(`${def.label} not found.`);

  // Enforce ownership when principal only has 'own' read access.
  const access = resolveObjectAccess(ctx.actor, objectName, 'read');
  if (access === 'own') {
    if (ctx.actor.kind !== 'user') throw new Error('Forbidden: no access to this object.');
    if (!recordBelongsToUser(record as Record<string, unknown>, ctx.actor.userId, getObjectOwnership(def))) {
      throw new Error('Forbidden: not owner of this record.');
    }
  }
  return record;
}

export async function objectCreate(objectName: string, data: Record<string, unknown>, ctx: ServiceContext): Promise<unknown> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

  assertCan(ctx.actor, { object: { type: objectName, op: 'create' } });

  const model = getModel(def);
  const record = await model.create({ data });

  if (def.events) {
    await emitEvent(ctx, `${objectName.toLowerCase()}.created`, {
      objectType: objectName,
      objectId: (record as any).id,
      payload: record,
    });
  }

  return record;
}

export async function objectUpdate(objectName: string, id: string, data: Record<string, unknown>, ctx: ServiceContext): Promise<unknown> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

  const model = getModel(def);
  const ownership = getObjectOwnership(def);

  // Fetch the current record to enforce ownership scoping for 'own' access.
  const existing = await model.findUnique({ where: { id } });
  if (!existing) throw new Error(`${def.label} not found.`);
  assertCan(
    ctx.actor,
    { object: { type: objectName, op: 'update', record: existing as Record<string, unknown> } },
    { ownership },
  );

  const record = await model.update({ where: { id }, data });

  if (def.events) {
    await emitEvent(ctx, `${objectName.toLowerCase()}.updated`, {
      objectType: objectName,
      objectId: id,
      payload: record,
    });
  }

  return record;
}

export async function objectDelete(objectName: string, id: string, ctx: ServiceContext): Promise<void> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

  const model = getModel(def);
  const ownership = getObjectOwnership(def);

  const existing = await model.findUnique({ where: { id } });
  if (!existing) throw new Error(`${def.label} not found.`);
  assertCan(
    ctx.actor,
    { object: { type: objectName, op: 'delete', record: existing as Record<string, unknown> } },
    { ownership },
  );

  await model.delete({ where: { id } });

  if (def.events) {
    await emitEvent(ctx, `${objectName.toLowerCase()}.deleted`, {
      objectType: objectName,
      objectId: id,
    });
  }
}

export async function objectBulkUpdate(
  objectName: string,
  items: Array<{ id: string } & Record<string, unknown>>,
  ctx: ServiceContext
): Promise<Array<{ id: string; ok: boolean; error?: string }>> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

  assertCan(ctx.actor, { object: { type: objectName, op: 'bulk' } });
  const ownership = getObjectOwnership(def);
  const access = resolveObjectAccess(ctx.actor, objectName, 'update');

  const model = getModel(def);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const { id, ...data } of items) {
    try {
      // If only 'own' access, verify ownership before each write.
      if (access === 'own') {
        if (ctx.actor.kind !== 'user') {
          results.push({ id, ok: false, error: 'Forbidden: no access to this object.' });
          continue;
        }
        const existing = await model.findUnique({ where: { id } });
        if (!existing) {
          results.push({ id, ok: false, error: `${def.label} not found.` });
          continue;
        }
        if (!recordBelongsToUser(existing as Record<string, unknown>, ctx.actor.userId, ownership)) {
          results.push({ id, ok: false, error: 'Forbidden: not owner of this record.' });
          continue;
        }
      } else if (access === 'none') {
        results.push({ id, ok: false, error: 'Forbidden: no access to this object.' });
        continue;
      }
      await model.update({ where: { id }, data });
      results.push({ id, ok: true });
      if (def.events) {
        await emitEvent(ctx, `${objectName.toLowerCase()}.updated`, {
          objectType: objectName,
          objectId: id,
          payload: data,
        });
      }
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return results;
}

export async function objectBulkDelete(
  objectName: string,
  ids: string[],
  ctx: ServiceContext
): Promise<{ deleted: number }> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

  assertCan(ctx.actor, { object: { type: objectName, op: 'bulk' } });
  const ownership = getObjectOwnership(def);
  const access = resolveObjectAccess(ctx.actor, objectName, 'delete');

  const model = getModel(def);

  let targetIds = ids;
  if (access === 'own') {
    if (ctx.actor.kind !== 'user') throw new Error('Forbidden: no access to this object.');
    const existing = await model.findMany({ where: { id: { in: ids } } });
    const userId = ctx.actor.userId;
    targetIds = (existing as Array<Record<string, unknown>>)
      .filter((r) => recordBelongsToUser(r, userId, ownership))
      .map((r) => r.id as string);
  } else if (access === 'none') {
    throw new Error('Forbidden: no access to this object.');
  }

  if (targetIds.length === 0) return { deleted: 0 };
  const result = await model.deleteMany({ where: { id: { in: targetIds } } });

  if (def.events) {
    await emitEvent(ctx, `${objectName.toLowerCase()}.bulk_deleted`, {
      objectType: objectName,
      payload: { ids: targetIds },
    });
  }

  return { deleted: result.count };
}
