import { db } from '@hq/db';
import type { ServiceContext } from '@hq/services';
import { emitEvent } from '@hq/events';
import { objects } from './registry';
import type { ListParams, ObjectDefinition } from './types';

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

export async function objectList(objectName: string, params: ListParams, _ctx: ServiceContext): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

  const model = getModel(def);
  const where = buildWhere(def, params);
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

export async function objectCount(objectName: string, params: Pick<ListParams, 'q' | 'filters'>, _ctx: ServiceContext): Promise<number> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

  const model = getModel(def);
  const where = buildWhere(def, params);
  return model.count({ where });
}

export async function objectGet(objectName: string, id: string, _ctx: ServiceContext): Promise<unknown> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

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
  return record;
}

export async function objectCreate(objectName: string, data: Record<string, unknown>, ctx: ServiceContext): Promise<unknown> {
  const def = objects[objectName];
  if (!def) throw new Error(`Unknown object: ${objectName}`);

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

  const model = getModel(def);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const { id, ...data } of items) {
    try {
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

  const model = getModel(def);
  const result = await model.deleteMany({ where: { id: { in: ids } } });

  if (def.events) {
    await emitEvent(ctx, `${objectName.toLowerCase()}.bulk_deleted`, {
      objectType: objectName,
      payload: { ids },
    });
  }

  return { deleted: result.count };
}
