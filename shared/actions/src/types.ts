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

/** Action governance — informs the UI, dispatcher, and approval flow. */
export type ActionRisk = 'low' | 'medium' | 'high';

export interface ActionApproval {
  /** When true, the dispatcher creates an ActionApprovalRequest instead of executing. */
  required?: boolean;
  /** Short explanation of why approval is required — shown on the approval screen. */
  reason?: string;
  /**
   * Permission keys that exempt a principal from the approval gate. If the
   * principal holds any of these, the action runs immediately.
   */
  bypassScopes?: string[];
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
  /**
   * Risk level. When omitted, the dispatcher infers from action shape:
   *  - read-only → low
   *  - create/update → medium
   *  - delete / bulk delete → high
   */
  risk?: ActionRisk;
  approval?: ActionApproval;
  parameters: z.ZodType<TParams>;
  handler: (params: TParams, ctx: ActionContext) => Promise<TResult>;
}

/**
 * Infer a risk level from an action's shape when not explicitly declared.
 * Extracted for reuse by the dispatcher and UI.
 */
export function inferActionRisk(action: ActionDefinition): ActionRisk {
  if (action.risk) return action.risk;
  const name = action.name.toLowerCase();
  if (action.objects?.deletes && action.objects.deletes.length > 0) return 'high';
  if (name.endsWith('.delete') || name.endsWith('.bulkdelete')) return 'high';
  if (name.includes('.merge') || name.includes('.archive') || name.includes('.send')) return 'high';
  if (action.objects?.writes && action.objects.writes.length > 0) return 'medium';
  if (name.endsWith('.create') || name.endsWith('.update') || name.endsWith('.bulkupdate')) return 'medium';
  if (name.endsWith('.assign') || name.endsWith('.markblocked') || name.endsWith('.complete')) return 'medium';
  return 'low';
}
