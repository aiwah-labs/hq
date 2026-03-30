import { registerMessagingWorkers } from './messaging.js';

export async function registerAllWorkers(): Promise<void> {
  await registerMessagingWorkers();
}
