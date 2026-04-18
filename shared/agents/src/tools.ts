import { tool, jsonSchema } from 'ai';
import { z } from 'zod';
import { resolveCapabilities } from './capabilities.js';
import { actionRegistry, dispatchAction } from '@hq/actions';
import { createServiceContext } from '@hq/services';
import type { ServiceContext } from '@hq/services';
import type { BotScope, PermissionMap } from '@hq/auth/types';
import type { AgentCapability } from './types.js';

// Minimal Zod v4 → JSON Schema converter for tool parameters.
// Handles all types used in action parameter definitions including coerce, record, pipe, default.
type JsonSchemaObj = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaObj>;
  required?: string[];
  items?: JsonSchemaObj;
  description?: string;
  enum?: unknown[];
  additionalProperties?: JsonSchemaObj | boolean;
};

function zodToJsonSchemaMinimal(schema: z.ZodType): JsonSchemaObj {
  const s = schema as unknown as {
    type?: string;
    shape?: Record<string, unknown>;
    _def?: {
      type?: string;
      description?: string;
      innerType?: unknown;
      in?: unknown;
      out?: unknown;
      shape?: Record<string, unknown>;
      values?: unknown[];
      entries?: unknown;
      element?: unknown;
      valueType?: unknown;
      defaultValue?: unknown;
      schema?: unknown;
    };
  };
  const type = s.type ?? s._def?.type ?? 'unknown';

  switch (type) {
    case 'object': {
      const shape = s.shape ?? s._def?.shape ?? {};
      const properties: Record<string, JsonSchemaObj> = {};
      const required: string[] = [];
      for (const [key, field] of Object.entries(shape)) {
        const f = field as unknown as { type?: string; _def?: { type?: string; description?: string; innerType?: unknown } };
        const isOptional = f.type === 'optional' || f._def?.type === 'optional';
        const inner = isOptional ? ((f._def?.innerType ?? field) as z.ZodType) : (field as z.ZodType);
        const converted = zodToJsonSchemaMinimal(inner);
        const desc = f._def?.description;
        properties[key] = desc ? { ...converted, description: desc } : converted;
        if (!isOptional) required.push(key);
      }
      return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
    }
    case 'array': {
      const element = s._def?.element as z.ZodType | undefined;
      return { type: 'array', ...(element ? { items: zodToJsonSchemaMinimal(element) } : {}) };
    }
    case 'enum':
    case 'nativeEnum': {
      const entries = s._def?.entries ?? s._def?.values ?? {};
      const enumValues = Array.isArray(entries)
        ? entries
        : Object.values(entries as Record<string, string>);
      return { type: 'string', enum: enumValues };
    }
    case 'optional': {
      const inner = s._def?.innerType as z.ZodType | undefined;
      return inner ? zodToJsonSchemaMinimal(inner) : { type: 'string' };
    }
    case 'default': {
      const inner = s._def?.innerType as z.ZodType | undefined;
      return inner ? zodToJsonSchemaMinimal(inner) : { type: 'string' };
    }
    case 'pipe':
    case 'pipeline': {
      const out = s._def?.out as z.ZodType | undefined;
      const inner = s._def?.innerType as z.ZodType | undefined;
      return (out ? zodToJsonSchemaMinimal(out) : inner ? zodToJsonSchemaMinimal(inner) : { type: 'number' });
    }
    case 'record': {
      const valueType = s._def?.valueType as z.ZodType | undefined;
      return {
        type: 'object',
        additionalProperties: valueType ? zodToJsonSchemaMinimal(valueType) : { type: 'string' },
      };
    }
    case 'effects': {
      const inner = s._def?.schema as z.ZodType | undefined;
      return inner ? zodToJsonSchemaMinimal(inner) : { type: 'string' };
    }
    case 'number': return { type: 'number' };
    case 'boolean': return { type: 'boolean' };
    case 'string': return { type: 'string' };
    case 'unknown':
    case 'any': return {};
    default: return { type: 'string' };
  }
}

function buildNoPermissions(): PermissionMap {
  return {
    'workshop.view': false,
    'content.all': false,
    'settings.view': false,
    'users.view': false,
    'users.manage': false,
    'admin.surface': false,
    'bots.view': false,
    'bots.create': false,
    'bots.manage.any': false,
    'messaging.view': false,
  };
}

export function buildAgentServiceContext(
  agentKey: string,
  capabilities: AgentCapability[],
  channelRef?: string | null,
): ServiceContext {
  const { actions } = resolveCapabilities(capabilities);
  const resolvedScopes = actions
    .flatMap((name) => actionRegistry.get(name)?.scopes ?? [])
    .filter((s, i, arr) => arr.indexOf(s) === i) as BotScope[];

  // Agents run as bot principals — no user auth needed
  return createServiceContext(
    {
      kind: 'bot',
      source: 'apikey',
      apiKeyId: `agent:${agentKey}`,
      botId: agentKey,
      botSlug: agentKey,
      botName: `Agent: ${agentKey}`,
      createdByUserId: 'system',
      createdByEmail: 'bot@aiwahlabs.com',
      scopes: resolvedScopes,
      permissions: buildNoPermissions(),
    },
    { channelRef: channelRef ?? undefined },
  );
}

// Using Record<string, unknown> to avoid complex generic mismatches between ai SDK and zod v4
export function buildToolMap(
  capabilities: AgentCapability[],
  ctx: ServiceContext
): Record<string, unknown> {
  const { actions: actionNames } = resolveCapabilities(capabilities);
  const tools: Record<string, unknown> = {};

  for (const name of actionNames) {
    const action = actionRegistry.get(name);
    if (!action) continue;

    // dots → underscores (AI SDK tool name constraint)
    const toolKey = name.replace(/\./g, '_');

    // Convert Zod v4 schema to plain JSON Schema to avoid zod v3/v4 peer dep mismatch
    const rawSchema = zodToJsonSchemaMinimal(action.parameters);
    const paramSchema = rawSchema.type === 'object' ? rawSchema : { type: 'object' as const, properties: {} };

    tools[toolKey] = tool({
      description: action.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: jsonSchema(paramSchema as any),
      execute: async (params) => {
        // Route every agent tool call through the central dispatcher. This
        // applies policy, risk inference, approval gating, and audit logging
        // the same way the HTTP and MCP surfaces do — agents cannot sidestep
        // governance by calling an action directly.
        try {
          const principal = ctx.actor;
          const outcome = await dispatchAction(name, params, principal, {
            buildContext: () => ctx,
          });
          if (outcome.ok) {
            if ('pending' in outcome && outcome.pending) {
              return {
                status: 'pending_approval',
                approvalRequestId: outcome.approvalRequestId,
                executionId: outcome.executionId,
                risk: outcome.risk,
                message:
                  outcome.reason ??
                  `Action '${name}' requires human approval before it can run.`,
              };
            }
            return outcome.result;
          }
          // Surface the structured dispatcher error to the model.
          const err = new Error(outcome.message) as Error & {
            status?: number;
            code?: string;
          };
          err.status = outcome.status;
          err.code = outcome.code;
          throw err;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[tool] ${toolKey} error: ${msg}`);
          throw err;
        }
      },
    });
  }

  return tools;
}

/** Build a map of toolKey → human-readable title for use in streaming annotations. */
export function buildToolTitleMap(capabilities: AgentCapability[]): Map<string, string> {
  const { actions: actionNames } = resolveCapabilities(capabilities);
  const map = new Map<string, string>();
  for (const name of actionNames) {
    const action = actionRegistry.get(name);
    if (!action) continue;
    const toolKey = name.replace(/\./g, '_');
    // title > description as fallback (trimmed to 60 chars)
    const label = action.title ?? action.description;
    map.set(toolKey, label.length > 60 ? label.slice(0, 57) + '…' : label);
  }
  return map;
}
