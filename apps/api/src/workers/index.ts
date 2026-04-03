// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import { registerMessagingWorkers } from './messaging.js';

export async function registerAllWorkers(): Promise<void> {
  await registerMessagingWorkers();
}
