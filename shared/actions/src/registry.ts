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
} from '@hq/objects';
import type { ActionDefinition } from './types.js';
import { listParamsSchema, deriveCreateSchema, deriveUpdateSchema } from './schema.js';

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();

  register(action: ActionDefinition): void {
    this.actions.set(action.name, action);
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  list(): ActionDefinition[] {
    return [...this.actions.values()];
  }

  /** Return actions where at least one required scope is granted. */
  resolve(grantedScopes: string[]): ActionDefinition[] {
    const granted = new Set(grantedScopes);
    return this.list().filter((a) => a.scopes.some((s) => granted.has(s)));
  }

  /** Auto-register standard CRUD actions for every registered object. */
  registerObjectCrud(): void {
    for (const [objectName, def] of Object.entries(objects)) {
      const lower = objectName.toLowerCase();
      const createSchema = deriveCreateSchema(def);
      const updateSchema = deriveUpdateSchema(def);

      const readScope = def.scopes.read;
      const writeScope = def.scopes.write;
      const deleteScope = def.scopes.delete ?? def.scopes.write;

      const list: ActionDefinition = {
        name: `${lower}.list`,
        title: `List ${def.pluralLabel}`,
        description: `List ${def.pluralLabel.toLowerCase()} with optional search, filters, sort, and pagination.`,
        category: 'crud',
        objects: { reads: [objectName] },
        scopes: [readScope],
        parameters: listParamsSchema,
        handler: async (params, ctx) => objectList(objectName, params as never, ctx as never),
      };

      const count: ActionDefinition = {
        name: `${lower}.count`,
        title: `Count ${def.pluralLabel}`,
        description: `Count ${def.pluralLabel.toLowerCase()} matching optional search/filters.`,
        category: 'crud',
        objects: { reads: [objectName] },
        scopes: [readScope],
        parameters: z.object({
          q: z.string().optional(),
          filters: z.record(z.string(), z.unknown()).optional(),
        }),
        handler: async (params, ctx) => objectCount(objectName, params as never, ctx as never),
      };

      const get: ActionDefinition = {
        name: `${lower}.get`,
        title: `Get ${def.label}`,
        description: `Return a single ${def.label.toLowerCase()} by id.`,
        category: 'crud',
        objects: { reads: [objectName] },
        scopes: [readScope],
        parameters: z.object({ id: z.string().min(1) }),
        handler: async (params, ctx) => {
          const { id } = params as { id: string };
          return objectGet(objectName, id, ctx as never);
        },
      };

      const create: ActionDefinition = {
        name: `${lower}.create`,
        title: `Create ${def.label}`,
        description: `Create a new ${def.label.toLowerCase()}.`,
        category: 'crud',
        objects: { writes: [objectName] },
        scopes: [writeScope],
        parameters: createSchema,
        handler: async (data, ctx) =>
          objectCreate(objectName, data as Record<string, unknown>, ctx as never),
      };

      const update: ActionDefinition = {
        name: `${lower}.update`,
        title: `Update ${def.label}`,
        description: `Update an existing ${def.label.toLowerCase()} by id.`,
        category: 'crud',
        objects: { writes: [objectName] },
        scopes: [writeScope],
        parameters: z.object({ id: z.string().min(1) }).passthrough(),
        handler: async (params, ctx) => {
          const { id, ...rest } = params as { id: string } & Record<string, unknown>;
          const data = updateSchema.parse(rest);
          return objectUpdate(objectName, id, data, ctx as never);
        },
      };

      const del: ActionDefinition = {
        name: `${lower}.delete`,
        title: `Delete ${def.label}`,
        description: `Delete a ${def.label.toLowerCase()} by id.`,
        category: 'crud',
        objects: { deletes: [objectName] },
        scopes: [deleteScope],
        parameters: z.object({ id: z.string().min(1) }),
        handler: async (params, ctx) => {
          const { id } = params as { id: string };
          await objectDelete(objectName, id, ctx as never);
          return { success: true } as const;
        },
      };

      const bulkUpdate: ActionDefinition = {
        name: `${lower}.bulkUpdate`,
        title: `Bulk update ${def.pluralLabel}`,
        description: `Apply partial updates to many ${def.pluralLabel.toLowerCase()} in one call.`,
        category: 'crud',
        objects: { writes: [objectName] },
        scopes: [writeScope],
        parameters: z.object({
          updates: z.array(z.object({ id: z.string().min(1) }).passthrough()),
        }),
        handler: async (params, ctx) => {
          const { updates } = params as {
            updates: Array<{ id: string } & Record<string, unknown>>;
          };
          return objectBulkUpdate(objectName, updates, ctx as never);
        },
      };

      const bulkDelete: ActionDefinition = {
        name: `${lower}.bulkDelete`,
        title: `Bulk delete ${def.pluralLabel}`,
        description: `Delete many ${def.pluralLabel.toLowerCase()} by id.`,
        category: 'crud',
        objects: { deletes: [objectName] },
        scopes: [deleteScope],
        risk: 'high',
        approval: {
          required: true,
          reason: `Bulk delete of ${def.pluralLabel.toLowerCase()} is destructive and non-reversible.`,
          bypassScopes: ['approvals.decide'],
        },
        parameters: z.object({ ids: z.array(z.string().min(1)) }),
        handler: async (params, ctx) => {
          const { ids } = params as { ids: string[] };
          return objectBulkDelete(objectName, ids, ctx as never);
        },
      };

      for (const a of [list, count, get, create, update, del, bulkUpdate, bulkDelete]) {
        this.register(a);
      }
    }
  }
}

export const actionRegistry = new ActionRegistry();

/** Convenience alias kept for existing imports. */
export const registry = actionRegistry;

export function defineAction<TParams, TResult>(
  def: ActionDefinition<TParams, TResult>,
): ActionDefinition<TParams, TResult> {
  actionRegistry.register(def as ActionDefinition);
  return def;
}
