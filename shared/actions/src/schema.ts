import { z } from 'zod';
import type { ObjectDefinition } from '@hq/objects';
import type { ActionDefinition, ActionRisk } from './types.js';
import { inferActionRisk } from './types.js';

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

export interface SerializedAction {
  name: string;
  title?: string;
  description: string;
  category?: ActionDefinition['category'];
  scopes: string[];
  objects?: ActionDefinition['objects'];
  resources?: string[];
  risk: ActionRisk;
  approval?: {
    required: boolean;
    reason?: string;
    bypassScopes?: string[];
  };
  parameters: JsonSchema;
}

type JsonSchema =
  | { type: 'object'; properties: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean }
  | { type: 'array'; items: JsonSchema }
  | { type: 'string'; enum?: string[]; format?: string; description?: string }
  | { type: 'number' | 'integer'; minimum?: number; maximum?: number; description?: string }
  | { type: 'boolean'; description?: string }
  | { type: 'null' }
  | { anyOf: JsonSchema[] }
  | { $ref: string }
  | { description?: string; [key: string]: unknown };

/** Convert a zod schema to a minimal JSON Schema suitable for MCP clients and UI preview. */
export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  // Unwrap metadata wrappers.
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault || schema instanceof z.ZodNullable) {
    return zodToJsonSchema((schema as z.ZodOptional<z.ZodTypeAny>).unwrap());
  }
  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchema(schema.innerType());
  }
  if (schema instanceof z.ZodBranded) {
    return zodToJsonSchema((schema as unknown as z.ZodBranded<z.ZodTypeAny, never>).unwrap());
  }
  if (schema instanceof z.ZodPipeline) {
    return zodToJsonSchema((schema as unknown as { _def: { out: z.ZodTypeAny } })._def.out);
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }
  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: [...(schema as z.ZodEnum<[string, ...string[]]>).options] };
  }
  if (schema instanceof z.ZodLiteral) {
    const val = (schema as z.ZodLiteral<unknown>).value;
    if (typeof val === 'string') return { type: 'string', enum: [val] };
    if (typeof val === 'number') return { type: 'number' };
    if (typeof val === 'boolean') return { type: 'boolean' };
    return { type: 'null' };
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema((schema as z.ZodArray<z.ZodTypeAny>).element) };
  }
  if (schema instanceof z.ZodObject) {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, field] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(field as z.ZodTypeAny);
      if (!(field instanceof z.ZodOptional) && !(field instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    const out: JsonSchema = { type: 'object', properties };
    if (required.length > 0) (out as { required?: string[] }).required = required;
    return out;
  }
  if (schema instanceof z.ZodUnion) {
    const options = (schema as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>).options as z.ZodTypeAny[];
    return { anyOf: options.map((o) => zodToJsonSchema(o)) };
  }
  if (schema instanceof z.ZodRecord) {
    return { type: 'object', properties: {}, additionalProperties: true };
  }
  // Fallback for unknown / any / null.
  return {};
}

export function serializeAction(action: ActionDefinition): SerializedAction {
  return {
    name: action.name,
    title: action.title,
    description: action.description,
    category: action.category,
    scopes: action.scopes,
    objects: action.objects,
    resources: action.resources,
    risk: inferActionRisk(action),
    approval: action.approval?.required
      ? {
          required: true,
          reason: action.approval.reason,
          bypassScopes: action.approval.bypassScopes,
        }
      : undefined,
    parameters: zodToJsonSchema(action.parameters as z.ZodTypeAny),
  };
}
