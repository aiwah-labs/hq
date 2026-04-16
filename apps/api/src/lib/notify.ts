import { db } from '@hq/db';

// ─── Event Types ──────────────────────────────────────────────────────────────

export type MessagingEvent =
  | { type: 'message.created';    threadId: string; message: Record<string, unknown> }
  | { type: 'message.updated';    threadId: string; message: Record<string, unknown> }
  | { type: 'message.deleted';    threadId: string; messageId: string }
  | { type: 'message.streaming';  threadId: string; messageId: string; part:
      | { type: 'text-delta'; delta: string }
      | { type: 'reasoning-delta'; delta: string }
      | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
      | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
    }
  | { type: 'reaction.added';     threadId: string; messageId: string; reaction: Record<string, unknown> }
  | { type: 'reaction.removed';   threadId: string; messageId: string; emoji: string; reactorType: string; reactorId: string }
  | { type: 'thread.updated';     thread: Record<string, unknown> }
  | { type: 'participant.joined'; threadId: string; actorType: string; actorId: string }
  | { type: 'participant.left';   threadId: string; actorType: string; actorId: string }
  | { type: 'typing.start';       threadId: string; actorType: string; actorId: string; actorName: string }
  | { type: 'typing.stop';        threadId: string; actorType: string; actorId: string }
  | { type: 'presence.changed';   actorType: string; actorId: string; status: string }
  | { type: 'notification';       recipientType: string; recipientId: string; notification: Record<string, unknown> };

/**
 * Publishes a messaging event via Postgres LISTEN/NOTIFY.
 * The SSE manager picks this up and fans out to connected clients.
 */
export async function notifyMessaging(event: MessagingEvent): Promise<void> {
  const payload = JSON.stringify(event);
  await db.$executeRaw`SELECT pg_notify('aiwah_messaging', ${payload})`;
}
