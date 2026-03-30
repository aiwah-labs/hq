import type { ActionDefinition } from './types.js';

class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();

  register(action: ActionDefinition): void {
    this.actions.set(action.name, action);
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  list(): ActionDefinition[] {
    return [...this.actions.values()];
  }
}

export const registry = new ActionRegistry();

export function defineAction<TParams, TResult>(
  def: ActionDefinition<TParams, TResult>
): ActionDefinition<TParams, TResult> {
  registry.register(def as ActionDefinition);
  return def;
}
