/**
 * Seed modules
 *
 * Each file in this folder exports a `seed(db)` function that populates the
 * database with sample data for one example module. The top-level `seed.ts`
 * script imports them from here and runs each in turn.
 *
 * Keep platform-level seeds (admin user creation, initial superadmin) in the
 * main `seed.ts` — seed modules should be purely additive demo data.
 */
import type { db as Db } from '../client.js';
import { seedCrm } from './crm.js';
import { seedProjectsTasks } from './projects-tasks.js';

export interface SeedModule {
  name: string;
  seed: (db: typeof Db) => Promise<void>;
}

export const seedModules: SeedModule[] = [
  { name: 'crm', seed: seedCrm },
  { name: 'projects-tasks', seed: seedProjectsTasks },
];
