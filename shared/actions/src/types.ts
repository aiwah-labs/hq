import type { z } from 'zod';
import type { db } from '@hq/db';

export interface ActionContext {
  db: typeof db;
  principal: { type: string; id: string; scopes?: string[] };
}

export interface ActionDefinition<TParams = unknown, TResult = unknown> {
  name: string;
  description: string;
  category: 'crud' | 'custom' | 'integration';
  scopes: string[];
  parameters: z.ZodType<TParams>;
  handler: (params: TParams, ctx: ActionContext) => Promise<TResult>;
}
