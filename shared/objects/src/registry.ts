/**
 * Object registry
 *
 * The registry is the single source of truth for "which objects does this
 * deployment expose?". It's split into two layers:
 *
 *   1. **Platform** — objects that every HQ deployment needs. Currently empty
 *      because the 0.3 template keeps Users and Sessions out of the generic
 *      object machinery (they have bespoke UI and policy).
 *   2. **Modules** — optional, swappable feature modules. Ship with the
 *      template as examples; fork/delete at will. Every module lives in
 *      `./modules/<name>.ts` and is surfaced through `./modules/index.ts`.
 *
 * `docs/modules.md` documents the full convention for adding your own module.
 */
import type { ObjectDefinition } from './types.js';
import { moduleObjects } from './modules/index.js';
import { filesPlatformObjects } from './platform/files.js';

/**
 * Platform-level object definitions that ship with every HQ deployment.
 * Today: Folder + FileObject (the files module). Users and Sessions stay out
 * of the generic object machinery — they have bespoke UI and policy.
 */
const platformObjects: Record<string, ObjectDefinition> = {
  ...filesPlatformObjects,
};

export const objects: Record<string, ObjectDefinition> = {
  ...platformObjects,
  ...moduleObjects,
};
