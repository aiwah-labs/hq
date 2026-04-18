import type { ServiceContext } from '@hq/services';

// ─── Node types ───────────────────────────────────────────────────────────────

export type NodeType =
  | 'action'
  | 'agent'
  | 'condition'
  | 'delay'
  | 'function'
  | 'loop'
  | 'parallel'
  | 'subworkflow'
  | 'wait';

export interface NodeAnnotation {
  label: string;
  description?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  delayMs?: number;
  backoff?: 'linear' | 'exponential';
}

interface BaseNodeDef {
  id: string;
  type: NodeType;
  annotation: NodeAnnotation;
  retryPolicy?: RetryPolicy;
  onError?: 'fail' | 'skip' | 'continue';
  timeoutMs?: number;
}

export interface ActionNodeDef extends BaseNodeDef {
  type: 'action';
  actionName: string;
  inputMap?: Record<string, string>;
}

export interface AgentNodeDef extends BaseNodeDef {
  type: 'agent';
  agentKey: string;
  prompt: string;
  tools?: string[];
}

export interface FunctionNodeDef extends BaseNodeDef {
  type: 'function';
  handler: (input: unknown, ctx: WorkflowExecutionContext) => Promise<unknown>;
}

export interface ConditionNodeDef extends BaseNodeDef {
  type: 'condition';
  expression: string;
}

export interface DelayNodeDef extends BaseNodeDef {
  type: 'delay';
  delaySeconds: number | string;
}

export interface ParallelNodeDef extends BaseNodeDef {
  type: 'parallel';
  branches: string[];
  waitForAll?: boolean;
}

export interface LoopNodeDef extends BaseNodeDef {
  type: 'loop';
  itemsExpression: string;
  bodyNodeId: string;
  maxIterations?: number;
}

export interface SubworkflowNodeDef extends BaseNodeDef {
  type: 'subworkflow';
  workflowKey: string;
  inputMap?: Record<string, string>;
}

export type NodeDef =
  | ActionNodeDef
  | AgentNodeDef
  | FunctionNodeDef
  | ConditionNodeDef
  | DelayNodeDef
  | ParallelNodeDef
  | LoopNodeDef
  | SubworkflowNodeDef;

// ─── Edges ────────────────────────────────────────────────────────────────────

export interface EdgeDef {
  from: string;
  to: string;
  condition?: string;
  label?: string;
}

// Keep the old alias for backwards-compat
export type WorkflowEdge = EdgeDef;

// ─── Triggers ─────────────────────────────────────────────────────────────────

export interface WorkflowTrigger {
  type: 'manual' | 'cron' | 'event' | 'webhook';
  cronExpression?: string;
  eventType?: string;
}

// ─── Evals ────────────────────────────────────────────────────────────────────

export interface StepEval {
  name: string;
  passed: boolean;
  score?: number;
  message?: string;
}

export type EvalFn = (
  input: unknown,
  output: unknown,
  ctx: WorkflowExecutionContext
) => Promise<StepEval[]>;

// ─── Workflow definition ──────────────────────────────────────────────────────

export interface WorkflowDefinition<TInput = unknown> {
  key: string;
  name: string;
  description: string;
  version?: number;
  triggers: WorkflowTrigger[];
  entryNodeId: string;
  nodes: NodeDef[];
  edges: EdgeDef[];
  inputSchema?: { safeParse: (input: unknown) => { success: boolean; data?: TInput; error?: unknown } };
  evals?: Record<string, EvalFn>;
}

// Keep the old alias for code that references WorkflowNode
export type WorkflowNode = NodeDef;

// ─── Execution context ────────────────────────────────────────────────────────

export interface StepResult {
  nodeId: string;
  status: 'completed' | 'failed' | 'skipped' | 'pending';
  output?: unknown;
  input?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  attempt: number;
  evals?: StepEval[];
}

export interface WorkflowExecutionContext {
  runId: string;
  workflowKey: string;
  triggerPayload: unknown;
  input: unknown;
  steps: Record<string, StepResult>;
  serviceContext: ServiceContext;
  variables: Record<string, unknown>;
  loop?: { item: unknown; index: number };
}
