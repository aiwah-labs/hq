import { db } from '@hq/db';

export interface PlatformEvent {
  type: string;
  payload: unknown;
  actorType?: string;
  actorId?: string;
}

export async function emitEvent(event: PlatformEvent): Promise<void> {
  // pg_notify for real-time fan-out
  await db.$executeRawUnsafe(
    `SELECT pg_notify('platform_events', $1)`,
    JSON.stringify(event)
  );
}
