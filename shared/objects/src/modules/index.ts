/**
 * Registry of example module object maps.
 *
 * To add your own module, drop a file in this folder that exports a
 * `Record<string, ObjectDefinition>` and spread it into `moduleObjects` below.
 * Keep platform-level concerns (users, bots, sessions) out of this file — they
 * live in the canonical schema, not in module code.
 *
 * To remove an example module, delete its file and drop the spread here.
 */
import type { ObjectDefinition } from '../types.js';
import { crmObjects } from './crm.js';
import { projectsTasksObjects } from './projects-tasks.js';

export const moduleObjects: Record<string, ObjectDefinition> = {
  ...crmObjects,
  ...projectsTasksObjects,
};
