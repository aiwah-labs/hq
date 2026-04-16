export interface TriggerConfig {
  type: 'message' | 'event' | 'cron' | 'webhook' | 'manual';
  mode?: 'dm' | 'mention';
  eventType?: string;
  cronExpression?: string;
}

export interface AgentDefinition {
  key: string;
  name: string;
  description: string;
  model: string;
  instructions: string;
  scopes: string[];
  maxSteps?: number;
  defaultTriggers: TriggerConfig[];
}
