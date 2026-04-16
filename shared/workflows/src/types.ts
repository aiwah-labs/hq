export type NodeType =
  | 'action'
  | 'agent'
  | 'condition'
  | 'loop'
  | 'parallel'
  | 'wait'
  | 'sub-workflow'
  | 'function';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  actionName?: string;
  agentKey?: string;
  inputMap?: Record<string, string>;
  condition?: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface WorkflowTrigger {
  type: 'manual' | 'cron' | 'event' | 'webhook';
  cronExpression?: string;
  eventType?: string;
}

export interface WorkflowDefinition<TInput = unknown> {
  key: string;
  name: string;
  description: string;
  version?: number;
  triggers: WorkflowTrigger[];
  entryNodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  inputSchema?: unknown;
}
