import { z } from 'zod';
import type { ObjectDefinition } from '@hq/objects';

export const listParamsSchema = z.object({
  q: z.string().optional(),
  filters: z.record(z.string(), z.string()).optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  include: z.array(z.string()).optional(),
});

export function deriveCreateSchema(def: ObjectDefinition): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, field] of Object.entries(def.fields)) {
    if (field.type === 'relation') continue;

    let schema: z.ZodTypeAny;

    switch (field.type) {
      case 'string':
        schema = z.string().trim();
        break;
      case 'text':
        schema = z.string();
        break;
      case 'number':
        schema = z.number();
        break;
      case 'boolean':
        schema = z.boolean();
        break;
      case 'date':
        schema = z.string().datetime();
        break;
      case 'enum':
        schema = z.enum(field.values as [string, ...string[]]);
        break;
      case 'json':
        schema = z.unknown();
        break;
      default:
        schema = z.unknown();
    }

    if (!field.required) {
      schema = schema.optional();
    }

    shape[key] = schema;
  }

  return z.object(shape);
}

export function deriveUpdateSchema(def: ObjectDefinition): z.ZodObject<any> {
  return deriveCreateSchema(def).partial();
}
