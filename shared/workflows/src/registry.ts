import type { WorkflowDefinition, NodeDef } from './types.js';

const workflows = new Map<string, WorkflowDefinition>();

export function defineWorkflow<TInput = unknown>(
  def: WorkflowDefinition<TInput>
): WorkflowDefinition<TInput> {
  if (workflows.has(def.key)) {
    throw new Error(`Duplicate workflow key: "${def.key}"`);
  }

  // Validate structural integrity
  const nodeIds = new Set(def.nodes.map((n) => n.id));

  if (!nodeIds.has(def.entryNodeId)) {
    throw new Error(
      `[workflow:${def.key}] entryNodeId "${def.entryNodeId}" is not in nodes`
    );
  }

  for (const edge of def.edges) {
    if (!nodeIds.has(edge.from)) {
      throw new Error(
        `[workflow:${def.key}] Edge has unknown source node "${edge.from}"`
      );
    }
    if (!nodeIds.has(edge.to)) {
      throw new Error(
        `[workflow:${def.key}] Edge has unknown target node "${edge.to}"`
      );
    }
  }

  for (const node of def.nodes) {
    if (node.type === 'parallel') {
      for (const branchId of node.branches) {
        if (!nodeIds.has(branchId)) {
          throw new Error(
            `[workflow:${def.key}] Parallel node "${node.id}" references unknown branch "${branchId}"`
          );
        }
      }
    }
    if (node.type === 'loop') {
      if (!nodeIds.has(node.bodyNodeId)) {
        throw new Error(
          `[workflow:${def.key}] Loop node "${node.id}" references unknown body node "${node.bodyNodeId}"`
        );
      }
    }
  }

  if (def.evals) {
    for (const nodeId of Object.keys(def.evals)) {
      if (!nodeIds.has(nodeId)) {
        throw new Error(
          `[workflow:${def.key}] Eval references unknown node "${nodeId}"`
        );
      }
    }
  }

  workflows.set(def.key, def as WorkflowDefinition);
  return def;
}

export function getWorkflow(key: string): WorkflowDefinition | undefined {
  return workflows.get(key);
}

export function listWorkflows(): WorkflowDefinition[] {
  return [...workflows.values()];
}

/** Alias used by tests and MCP tool listing. */
export function getWorkflows(): WorkflowDefinition[] {
  return listWorkflows();
}

export interface SerializedNodeDef {
  id: string;
  type: string;
  annotation: { label: string; description?: string };
  actionName?: string;
  inputMap?: Record<string, string>;
  agentKey?: string;
  branches?: string[];
  bodyNodeId?: string;
  itemsExpression?: string;
  workflowKey?: string;
  expression?: string;
  delaySeconds?: number | string;
  onError?: string;
  timeoutMs?: number;
}

export interface SerializedWorkflowDef {
  key: string;
  name: string;
  description: string;
  version?: number;
  triggers: WorkflowDefinition['triggers'];
  entryNodeId: string;
  nodes: SerializedNodeDef[];
  edges: WorkflowDefinition['edges'];
  requiresInput: boolean;
  hasEvals: string[];
}

export function serializeWorkflowDef(def: WorkflowDefinition): SerializedWorkflowDef {
  const nodes: SerializedNodeDef[] = def.nodes.map((node) => {
    // Strip non-serializable fields (handler functions, etc.)
    const base: SerializedNodeDef = {
      id: node.id,
      type: node.type,
      annotation: node.annotation,
    };
    if (node.type === 'action') {
      base.actionName = node.actionName;
      if (node.inputMap) base.inputMap = node.inputMap;
    } else if (node.type === 'agent') {
      base.agentKey = node.agentKey;
    } else if (node.type === 'parallel') {
      base.branches = node.branches;
    } else if (node.type === 'loop') {
      base.bodyNodeId = node.bodyNodeId;
      base.itemsExpression = node.itemsExpression;
    } else if (node.type === 'subworkflow') {
      base.workflowKey = node.workflowKey;
      if (node.inputMap) base.inputMap = node.inputMap;
    } else if (node.type === 'condition') {
      base.expression = node.expression;
    } else if (node.type === 'delay') {
      base.delaySeconds = node.delaySeconds;
    }
    if (node.onError) base.onError = node.onError;
    if (node.timeoutMs) base.timeoutMs = node.timeoutMs;
    return base;
  });

  return {
    key: def.key,
    name: def.name,
    description: def.description,
    version: def.version,
    triggers: def.triggers,
    entryNodeId: def.entryNodeId,
    nodes,
    edges: def.edges,
    requiresInput: !!def.inputSchema,
    hasEvals: def.evals ? Object.keys(def.evals) : [],
  };
}
