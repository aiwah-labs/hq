import type { WorkflowDefinition } from './types.js';

const workflows = new Map<string, WorkflowDefinition>();

export function defineWorkflow<TInput = unknown>(
  def: WorkflowDefinition<TInput>
): WorkflowDefinition<TInput> {
  workflows.set(def.key, def as WorkflowDefinition);
  return def;
}

export function getWorkflow(key: string): WorkflowDefinition | undefined {
  return workflows.get(key);
}

export function listWorkflows(): WorkflowDefinition[] {
  return [...workflows.values()];
}
