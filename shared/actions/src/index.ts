import { actionRegistry } from './registry.js';

export { ActionRegistry, actionRegistry, registry, defineAction } from './registry.js';
export { listParamsSchema, deriveCreateSchema, deriveUpdateSchema, serializeAction } from './schema.js';
export { dispatchAction, executeAction } from './dispatch.js';
export type { DispatchOptions, DispatchResult, DispatchSuccess, DispatchFailure } from './dispatch.js';
export type {
  ActionDefinition,
  ActionContext,
  ActionCategory,
  ActionObjects,
} from './types.js';
export type { SerializedAction } from './schema.js';

// Auto-register CRUD actions for every registered object.
actionRegistry.registerObjectCrud();

// Load custom actions (they may override / supplement CRUD defaults).
import './custom/demo/index.js';
