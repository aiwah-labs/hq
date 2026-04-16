import type { z } from 'zod';
import type { db } from '@hq/db';

export interface ActionContext {
  db: typeof db;
  principal: { type: string; id: string; scopes?: string[] };
}

export type ActionCategory = 'crud' | 'custom' | 'integration';

/** Which object types an action reads/writes/deletes. Used for governance + discovery. */
export interface ActionObjects {
  reads?: string[];
  writes?: string[];
  deletes?: string[];
}

export interface ActionDefinition<TParams = unknown, TResult = unknown> {
  name: string;
  /** Short, human-readable title. Defaults to `name` when omitted. */
  title?: string;
  description: string;
  /** Optional category hint for UIs and MCP. */
  category?: ActionCategory;
  /** The object types this action touches. */
  objects?: ActionObjects;
  /** Free-form resource identifiers (for things that aren't object types). */
  resources?: string[];
  scopes: string[];
  parameters: z.ZodType<TParams>;
  handler: (params: TParams, ctx: ActionContext) => Promise<TResult>;
}
