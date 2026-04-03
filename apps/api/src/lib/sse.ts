// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import pg from 'pg';
import type { FastifyReply } from 'fastify';
import type { MessagingEvent } from './notify.js';
import type { PlatformEventNotification } from '@hq/events';
import { routeEvent } from '@hq/events';
import { db } from '@hq/db';

// ─── Connection Registry ──────────────────────────────────────────────────────

interface SSEConnection {
  reply: FastifyReply;
  actorType: string;
  actorId: string;
  threadIds: Set<string>;
  lastRefreshedAt: number;
}

const connections = new Map<string, SSEConnection>();

function connectionKey(actorType: string, actorId: string, connId: string): string {
  return `${actorType}:${actorId}:${connId}`;
}

export function registerSSEConnection(
  connId: string,
  actorType: string,
  actorId: string,
  reply: FastifyReply,
  threadIds: string[]
): void {
  const key = connectionKey(actorType, actorId, connId);
  connections.set(key, {
    reply,
    actorType,
    actorId,
    threadIds: new Set(threadIds),
    lastRefreshedAt: Date.now(),
  });
}

export function unregisterSSEConnection(connId: string, actorType: string, actorId: string): void {
  connections.delete(connectionKey(actorType, actorId, connId));
}

/** Add a thread to all active connections for an actor (called after thread creation / participant join) */
export function addThreadToConnections(actorType: string, actorId: string, threadId: string): void {
  for (const conn of connections.values()) {
    if (conn.actorType === actorType && conn.actorId === actorId) {
      conn.threadIds.add(threadId);
    }
  }
}

export function sendSSEEvent(reply: FastifyReply, eventType: string, data: unknown): void {
  try {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    reply.raw.write(payload);
  } catch {
    // Connection already closed
  }
}

// ─── Thread membership cache refresh (every 60s) ────────────────────────────

async function refreshConnectionThreads(conn: SSEConnection): Promise<void> {
  const participations = await db.msgParticipant.findMany({
    where: { actorType: conn.actorType as 'USER' | 'BOT', actorId: conn.actorId, leftAt: null },
    select: { threadId: true },
  });
  conn.threadIds = new Set(participations.map((p) => p.threadId));
  conn.lastRefreshedAt = Date.now();
}

setInterval(async () => {
  const stale = [...connections.values()].filter(
    (c) => Date.now() - c.lastRefreshedAt > 60_000
  );
  await Promise.allSettled(stale.map(refreshConnectionThreads));
}, 30_000);

// ─── Postgres LISTEN loop ─────────────────────────────────────────────────────

let listenerClient: pg.Client | null = null;

export async function startSSEListener(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required for SSE listener');

  listenerClient = new pg.Client({ connectionString: dbUrl });
  await listenerClient.connect();
  await listenerClient.query('LISTEN aiwah_messaging');
  await listenerClient.query('LISTEN platform_events');

  listenerClient.on('notification', (msg) => {
    if (!msg.payload) return;

    if (msg.channel === 'platform_events') {
      // Route platform events (company.created, workflow.run.completed, etc.)
      try {
        const event = JSON.parse(msg.payload) as PlatformEventNotification;
        routeEvent(event).catch((err) =>
          console.error('[SSE] Platform event routing error:', err)
        );
      } catch { /* invalid payload */ }
      return;
    }

    // Messaging events (aiwah_messaging channel)
    let event: MessagingEvent;
    try {
      event = JSON.parse(msg.payload) as MessagingEvent;
    } catch {
      return;
    }

    fanoutEvent(event);
  });

  listenerClient.on('error', (err) => {
    console.error('[SSE] Postgres listener error:', err);
    // Reconnect after delay
    setTimeout(() => startSSEListener(), 5000);
  });

  console.log('[SSE] Postgres LISTEN started on channel aiwah_messaging');
}

export async function stopSSEListener(): Promise<void> {
  await listenerClient?.end();
  listenerClient = null;
}

// ─── Fan-out ──────────────────────────────────────────────────────────────────

function fanoutEvent(event: MessagingEvent): void {
  for (const conn of connections.values()) {
    if (shouldReceive(conn, event)) {
      const eventType = event.type;
      sendSSEEvent(conn.reply, eventType, event);
    }
  }
}

function shouldReceive(conn: SSEConnection, event: MessagingEvent): boolean {
  switch (event.type) {
    case 'message.created':
    case 'message.updated':
    case 'message.deleted':
    case 'message.streaming':
    case 'reaction.added':
    case 'reaction.removed':
    case 'typing.start':
    case 'typing.stop':
    case 'participant.joined':
    case 'participant.left':
      return conn.threadIds.has(event.threadId);

    case 'thread.updated': {
      const thread = event.thread as { id?: string };
      return thread.id ? conn.threadIds.has(thread.id) : false;
    }

    case 'presence.changed':
      // Send presence changes to all connected actors (could be filtered to shared threads later)
      return true;

    case 'notification':
      return conn.actorType === event.recipientType && conn.actorId === event.recipientId;

    default:
      return false;
  }
}
