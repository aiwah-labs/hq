import type { AgentDefinition } from './types.js';

const agents = new Map<string, AgentDefinition>();

export function defineAgent(def: AgentDefinition): AgentDefinition {
  agents.set(def.key, def);
  return def;
}

export function getAgent(key: string): AgentDefinition | undefined {
  return agents.get(key);
}

export function listAgents(): AgentDefinition[] {
  return [...agents.values()];
}
