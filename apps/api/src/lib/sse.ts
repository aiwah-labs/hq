import pg from 'pg';
import type { PlatformEventNotification } from '@hq/events';
import { routeEvent } from '@hq/events';

let listenerClient: pg.Client | null = null;

export async function startSSEListener(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required for SSE listener');

  listenerClient = new pg.Client({ connectionString: dbUrl });
  await listenerClient.connect();
  await listenerClient.query('LISTEN platform_events');

  listenerClient.on('notification', (msg) => {
    if (!msg.payload || msg.channel !== 'platform_events') return;
    try {
      const event = JSON.parse(msg.payload) as PlatformEventNotification;
      routeEvent(event).catch((err) =>
        console.error('[SSE] Platform event routing error:', err)
      );
    } catch { /* invalid payload */ }
  });

  listenerClient.on('error', (err) => {
    console.error('[SSE] Postgres listener error:', err);
    setTimeout(() => startSSEListener(), 5000);
  });

  console.log('[SSE] Postgres LISTEN started on channel platform_events');
}

export async function stopSSEListener(): Promise<void> {
  await listenerClient?.end();
  listenerClient = null;
}
