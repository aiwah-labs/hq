// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
export interface SkillDefinition {
  name: string;
  description: string;
  actions: string[];
  instructions?: string;
}

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();

  register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  list(): SkillDefinition[] {
    return [...this.skills.values()];
  }
}

export const skillRegistry = new SkillRegistry();

export function defineSkill(def: SkillDefinition): SkillDefinition {
  skillRegistry.register(def);
  return def;
}
