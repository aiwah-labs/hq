import { registerImportWorkers } from './imports.js';
import { registerFilesWorkers } from './files.js';

export async function registerAllWorkers(): Promise<void> {
  await registerImportWorkers();
  await registerFilesWorkers();
}
