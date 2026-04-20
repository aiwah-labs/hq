/**
 * Object registry
 *
 * The registry is the single source of truth for "which objects does this
 * deployment exposes?". Add business objects here by importing module
 * definitions from `./modules/`.
 *
 * Platform internals (Users, Sessions, Files, Folders) are intentionally
 * excluded — they have bespoke UI, policy, and API routes and must not be
 * treated as generic data objects.
 *
 * `docs/modules.md` documents the full convention for adding your own module.
 */
import type { ObjectDefinition } from './types.js';
import { moduleObjects } from './modules/index.js';

export const objects: Record<string, ObjectDefinition> = {
  ...moduleObjects,
};
