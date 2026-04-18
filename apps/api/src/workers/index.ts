import { registerMessagingWorkers } from './messaging.js';
import { registerImportWorkers } from './imports.js';
import { registerFilesWorkers } from './files.js';

export async function registerAllWorkers(): Promise<void> {
  await registerMessagingWorkers();
  await registerImportWorkers();
  await registerFilesWorkers();
}
