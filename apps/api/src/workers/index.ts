import { registerMessagingWorkers } from './messaging.js';
import { registerImportWorkers } from './imports.js';

export async function registerAllWorkers(): Promise<void> {
  await registerMessagingWorkers();
  await registerImportWorkers();
}
