// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
export { defineAgent, getAgent, listAgents } from './registry.js';
export type { AgentDefinition, TriggerConfig } from './types.js';

import './agents/assistant.js';
