import { skillRegistry } from './skills.js';
import { objects } from '@hq/objects';
import type { AgentCapability } from './types.js';

export function resolveCapabilities(
  capabilities: AgentCapability[]
): { actions: string[]; instructions: string[] } {
  const actions: string[] = [];
  const instructions: string[] = [];

  for (const cap of capabilities) {
    if (cap.type === 'action') {
      actions.push(cap.name);
    } else if (cap.type === 'skill') {
      const skill = skillRegistry.get(cap.name);
      if (!skill) continue;
      actions.push(...skill.actions);
      if (skill.instructions) {
        instructions.push(`## ${skill.description}\n${skill.instructions}`);
      }
    } else if (cap.type === 'object') {
      const obj = objects[cap.name];
      if (!obj) continue;
      const lower = cap.name.toLowerCase();
      // read permissions
      actions.push(`${lower}.list`, `${lower}.get`, `${lower}.count`);
      if (cap.permissions === 'all') {
        actions.push(
          `${lower}.create`,
          `${lower}.update`,
          `${lower}.delete`,
          `${lower}.bulkUpdate`,
          `${lower}.bulkDelete`
        );
      }
    }
  }

  return {
    actions: [...new Set(actions)],
    instructions,
  };
}
