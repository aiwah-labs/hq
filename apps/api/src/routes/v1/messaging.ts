import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@hq/db';
import { scheduleJob } from '@hq/jobs';
// @hq/agents is not bundled in the prod API container — agent trigger
// is queued as a job and processed by the agent worker (dev API / agent service).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _onChannelMessage: ((msg: any) => Promise<void>) | null = null;
let _agentTriggerChecked = false;
async function getAgentTrigger() {
  if (_agentTriggerChecked) return _onChannelMessage;
  _agentTriggerChecked = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('@hq/agents/triggers' as any);
    _onChannelMessage = mod.onChannelMessage ?? null;
  } catch {
    // Not available in this runtime (e.g. prod API container without agents bundle)
    _onChannelMessage = null;
  }
  return _onChannelMessage;
}
import { getStorageAdapter } from '@hq/storage';
import {
  createServiceContext,
  // Threads
  createThread,
  getThread,
  listThreadsForActor,
  updateThread,
  archiveThread,
  // Participants
  addParticipant,
  removeParticipant,
  updateParticipantSettings,
  // Messages
  sendMessage,
  editMessage,
  deleteMessage,
  listMessages,
  getMessageReplies,
  startStreamingMessage,
  finishStreamingMessage,
  // Reactions
  addReaction,
  removeReaction,
  // Read state
  markRead,
  markUnread,
  // Pins
  pinMessage,
  unpinMessage,
  listPins,
  // Bookmarks
  addBookmark,
  removeBookmark,
  listBookmarks,
  // Drafts
  saveDraft,
  getDraft,
  deleteDraft,
  // Search
  searchMessages,
  // Notifications
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  // Bot config
  upsertBotMessagingConfig,
  getBotMessagingConfig,
  // Attachments
  registerAttachment,
  getAttachment,
} from '@hq/services';
import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../../lib/auth.js';
import { notifyMessaging } from '../../lib/notify.js';
import {
  registerSSEConnection,
  unregisterSSEConnection,
  sendSSEEvent,
  addThreadToConnections,
} from '../../lib/sse.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBody<T>(input: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid request payload.', parsed.error.flatten());
  }
  return parsed.data;
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  return (text.match(urlRegex) ?? []).slice(0, 10);
}

function serializeMessage(msg: Record<string, unknown>): Record<string, unknown> {
  return {
    ...msg,
    sequenceNumber: msg.sequenceNumber?.toString(),
  };
}

// ─── Route Registration ────────────────────────────────────────────────────────

export async function registerMessagingRoutes(app: FastifyInstance) {

  // ── SSE Stream ──────────────────────────────────────────────────────────────

  app.get('/v1/messaging/stream', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);

    const actorRef = actor.kind === 'user'
      ? { type: 'USER', id: actor.userId }
      : actor.kind === 'agent'
        ? { type: 'AGENT', id: actor.agentKey }
        : { type: 'BOT', id: actor.botId };

    // Get initial thread list for this actor
    const participations = await db.msgParticipant.findMany({
      where: { actorType: actorRef.type as 'USER' | 'BOT' | 'AGENT', actorId: actorRef.id, leftAt: null },
      select: { threadId: true },
    });
    const threadIds = participations.map((p) => p.threadId);

    const connId = randomUUID();

    // Must set CORS manually — reply.raw bypasses @fastify/cors middleware
    const origin = request.headers.origin;
    const allowedOrigins = (process.env.API_CORS_ORIGINS ?? 'http://localhost:3002')
      .split(',').map((s) => s.trim());
    if (origin && allowedOrigins.includes(origin)) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin);
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    registerSSEConnection(connId, actorRef.type, actorRef.id, reply, threadIds);

    // Send initial connected event
    sendSSEEvent(reply, 'connected', {
      actorType: actorRef.type,
      actorId: actorRef.id,
      threadCount: threadIds.length,
    });

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(':heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    request.socket.on('close', () => {
      clearInterval(heartbeat);
      unregisterSSEConnection(connId, actorRef.type, actorRef.id);
    });

    // Keep the handler alive
    await new Promise<void>((resolve) => {
      request.socket.on('close', resolve);
    });
  });

  // ── Threads ─────────────────────────────────────────────────────────────────

  app.get('/v1/messaging/threads', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const query = z.object({ limit: z.coerce.number().max(50).default(30), cursor: z.string().optional() })
      .passthrough().parse(request.query);

    const threads = await listThreadsForActor(ctx, query);
    return threads.map((t) => ({ ...t, lastMessageAt: t.lastMessageAt?.toISOString() }));
  });

  app.post('/v1/messaging/threads', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const body = parseBody(request.body, z.object({
      type: z.enum(['DM', 'GROUP', 'CHANNEL']).nullish(),
      name: z.string().max(100).nullish(),
      description: z.string().max(500).nullish(),
      iconEmoji: z.string().max(10).nullish(),
      participants: z.array(z.object({
        type: z.enum(['USER', 'BOT', 'AGENT']),
        id: z.string(),
      })).min(1).max(50),
    }));

    const thread = await createThread(ctx, {
      ...body,
      type: body.type ?? undefined,
      name: body.name ?? undefined,
      description: body.description ?? undefined,
      iconEmoji: body.iconEmoji ?? undefined,
    });

    // Immediately subscribe all participants' SSE connections to this new thread
    const participants = await db.msgParticipant.findMany({
      where: { threadId: thread.id, leftAt: null },
      select: { actorType: true, actorId: true },
    });
    for (const p of participants) {
      addThreadToConnections(p.actorType, p.actorId, thread.id);
    }

    await notifyMessaging({ type: 'thread.updated', thread: thread as unknown as Record<string, unknown> });
    return thread;
  });

  app.get('/v1/messaging/threads/:threadId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    return getThread(ctx, threadId);
  });

  app.patch('/v1/messaging/threads/:threadId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({
      name: z.string().max(100).optional(),
      description: z.string().max(500).optional(),
      avatarUrl: z.string().url().optional(),
      iconEmoji: z.string().max(10).optional(),
    }));
    const thread = await updateThread(ctx, threadId, body);
    await notifyMessaging({ type: 'thread.updated', thread: thread as unknown as Record<string, unknown> });
    return thread;
  });

  app.delete('/v1/messaging/threads/:threadId', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    await archiveThread(ctx, threadId);
    return reply.code(204).send();
  });

  // ── Participants ─────────────────────────────────────────────────────────────

  app.get('/v1/messaging/threads/:threadId/participants', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    await requireAuth(request, { botScope: 'messaging.read' });
    return db.msgParticipant.findMany({ where: { threadId, leftAt: null } });
  });

  app.post('/v1/messaging/threads/:threadId/participants', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({
      actorType: z.enum(['USER', 'BOT', 'AGENT']),
      actorId: z.string(),
      role: z.enum(['admin', 'member']).default('member'),
    }));
    const participant = await addParticipant(ctx, threadId, { type: body.actorType, id: body.actorId }, body.role);
    await notifyMessaging({ type: 'participant.joined', threadId, actorType: body.actorType, actorId: body.actorId });
    return participant;
  });

  app.patch('/v1/messaging/threads/:threadId/participants/:actorType/:actorId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId, actorType, actorId } = z.object({
      threadId: z.string(), actorType: z.enum(['USER', 'BOT', 'AGENT']), actorId: z.string(),
    }).parse(request.params);
    const body = parseBody(request.body, z.object({
      isMuted: z.boolean().optional(),
      notifyLevel: z.enum(['all', 'mentions', 'none']).optional(),
      role: z.enum(['admin', 'member']).optional(),
    }));
    return updateParticipantSettings(ctx, threadId, { type: actorType, id: actorId }, body);
  });

  app.delete('/v1/messaging/threads/:threadId/participants/:actorType/:actorId', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId, actorType, actorId } = z.object({
      threadId: z.string(), actorType: z.enum(['USER', 'BOT', 'AGENT']), actorId: z.string(),
    }).parse(request.params);
    await removeParticipant(ctx, threadId, { type: actorType, id: actorId });
    await notifyMessaging({ type: 'participant.left', threadId, actorType, actorId });
    return reply.code(204).send();
  });

  // ── Messages ─────────────────────────────────────────────────────────────────

  app.get('/v1/messaging/threads/:threadId/messages', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    const query = z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().max(100).default(50),
      direction: z.enum(['before', 'after']).default('before'),
    }).parse(request.query);
    const messages = await listMessages(ctx, threadId, query);
    return messages.map(serializeMessage);
  });

  app.post('/v1/messaging/threads/:threadId/messages', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({
      content: z.string().max(8000).optional(),
      contentType: z.enum(['TEXT', 'CARD', 'SYSTEM', 'TOOL_RESULT', 'WORKFLOW']).optional(),
      blocks: z.array(z.unknown()).optional(),
      parentMessageId: z.string().optional(),
      attachmentIds: z.array(z.string()).optional(),
    }));

    const message = await sendMessage(ctx, threadId, body);

    // Notify SSE
    await notifyMessaging({
      type: 'message.created',
      threadId,
      message: serializeMessage(message as unknown as Record<string, unknown>),
    });

    // Fan out notifications + webhook deliveries
    const actorRef = actor.kind === 'user'
      ? { type: 'USER', id: actor.userId }
      : actor.kind === 'agent'
        ? { type: 'AGENT', id: actor.agentKey }
        : { type: 'BOT', id: actor.botId };
    await scheduleJob('messaging.fanout-notifications', {
      messageId: message.id,
      threadId,
      senderType: actorRef.type,
      senderId: actorRef.id,
    });

    // Unfurl links
    const urls = extractUrls(body.content ?? '');
    if (urls.length > 0) {
      await scheduleJob('messaging.unfurl-links', { messageId: message.id, urls });
    }

    // Fire agent triggers (mentions, thread follows, channel monitors)
    if (actor.kind === 'user') {
      const triggerFn = await getAgentTrigger();
      if (triggerFn) {
        // Agents available in this runtime — call directly
        const thread = await db.msgThread.findUnique({ where: { id: threadId } });
        await triggerFn({
          id: message.id,
          threadId,
          channelId: threadId,
          channelType: 'messaging',
          senderId: actor.userId,
          senderType: 'USER',
          content: body.content ?? '',
          isDm: thread?.type === 'DM',
          parentMessageId: body.parentMessageId,
        }).catch((err: unknown) => {
          console.error('[agent-trigger] onChannelMessage failed:', err);
        });
      } else {
        // Agents not available here — queue a job for the agent worker to pick up
        await scheduleJob('messaging.agent-trigger', {
          messageId: message.id,
          threadId,
          channelType: 'messaging',
          senderId: actor.userId,
          senderType: 'USER',
          content: body.content ?? '',
          parentMessageId: body.parentMessageId,
        }).catch((err: unknown) => {
          console.error('[agent-trigger] scheduleJob failed:', err);
        });
      }
    }

    return serializeMessage(message as unknown as Record<string, unknown>);
  });

  app.patch('/v1/messaging/messages/:messageId', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({
      content: z.string().max(8000).optional(),
      blocks: z.array(z.unknown()).optional(),
    }));
    const msg = await editMessage(ctx, messageId, body);
    await notifyMessaging({
      type: 'message.updated',
      threadId: msg.threadId,
      message: serializeMessage(msg as unknown as Record<string, unknown>),
    });
    return serializeMessage(msg as unknown as Record<string, unknown>);
  });

  app.delete('/v1/messaging/messages/:messageId', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const msg = await deleteMessage(ctx, messageId);
    await notifyMessaging({ type: 'message.deleted', threadId: msg.threadId, messageId });
    return reply.code(204).send();
  });

  app.get('/v1/messaging/messages/:messageId/replies', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const query = z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().max(100).default(50),
    }).parse(request.query);
    const msgs = await getMessageReplies(ctx, messageId, query);
    return msgs.map(serializeMessage);
  });

  // ── Streaming (for bots) ───────────────────────────────────────────────────

  app.post('/v1/messaging/threads/:threadId/messages/stream/start', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    const msg = await startStreamingMessage(ctx, threadId);
    await notifyMessaging({
      type: 'message.created',
      threadId,
      message: serializeMessage(msg as unknown as Record<string, unknown>),
    });
    return serializeMessage(msg as unknown as Record<string, unknown>);
  });

  app.patch('/v1/messaging/messages/:messageId/stream/append', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const partSchema = z.union([
      z.object({ type: z.literal('text-delta'), delta: z.string() }),
      z.object({ type: z.literal('reasoning-delta'), delta: z.string() }),
      z.object({ type: z.literal('tool-call'), toolCallId: z.string(), toolName: z.string(), toolTitle: z.string().optional(), args: z.unknown() }),
      z.object({ type: z.literal('tool-result'), toolCallId: z.string(), toolName: z.string(), result: z.unknown(), isError: z.boolean() }),
    ]);
    const body = parseBody(request.body, z.object({ part: partSchema }));
    const msg = await db.msgMessage.findUnique({ where: { id: messageId }, select: { threadId: true } });
    if (!msg) throw new ApiError(404, 'NOT_FOUND', 'Message not found.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await notifyMessaging({ type: 'message.streaming', threadId: msg.threadId, messageId, part: body.part as any });
    return { ok: true };
  });

  app.post('/v1/messaging/messages/:messageId/stream/finish', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({
      content: z.string().max(20000),
      blocks: z.array(z.unknown()).optional(),
    }));
    const msg = await finishStreamingMessage(ctx, messageId, body);
    await notifyMessaging({
      type: 'message.updated',
      threadId: msg.threadId,
      message: serializeMessage(msg as unknown as Record<string, unknown>),
    });
    // Fan out after streaming finishes
    const actorRef = actor.kind === 'user'
      ? { type: 'USER', id: actor.userId }
      : actor.kind === 'agent'
        ? { type: 'AGENT', id: actor.agentKey }
        : { type: 'BOT', id: actor.botId };
    await scheduleJob('messaging.fanout-notifications', {
      messageId: msg.id,
      threadId: msg.threadId,
      senderType: actorRef.type,
      senderId: actorRef.id,
    });
    return serializeMessage(msg as unknown as Record<string, unknown>);
  });

  // ── Reactions ──────────────────────────────────────────────────────────────

  app.post('/v1/messaging/messages/:messageId/reactions', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({ emoji: z.string().min(1).max(50) }));
    const msg = await db.msgMessage.findUnique({ where: { id: messageId }, select: { threadId: true } });
    if (!msg) throw new ApiError(404, 'NOT_FOUND', 'Message not found.');

    const actorRef = actor.kind === 'user'
      ? { type: 'USER' as const, id: actor.userId }
      : actor.kind === 'agent'
        ? { type: 'AGENT' as const, id: actor.agentKey }
        : { type: 'BOT' as const, id: actor.botId };

    const reactions = await addReaction(ctx, messageId, body.emoji);
    await notifyMessaging({
      type: 'reaction.added',
      threadId: msg.threadId,
      messageId,
      reaction: { emoji: body.emoji, actorType: actorRef.type, actorId: actorRef.id },
    });
    return reactions;
  });

  app.delete('/v1/messaging/messages/:messageId/reactions/:emoji', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { messageId, emoji } = z.object({ messageId: z.string(), emoji: z.string() }).parse(request.params);
    const msg = await db.msgMessage.findUnique({ where: { id: messageId }, select: { threadId: true } });
    if (!msg) throw new ApiError(404, 'NOT_FOUND', 'Message not found.');
    const actorRef = actor.kind === 'user'
      ? { type: 'USER' as const, id: actor.userId }
      : actor.kind === 'agent'
        ? { type: 'AGENT' as const, id: actor.agentKey }
        : { type: 'BOT' as const, id: actor.botId };
    await removeReaction(ctx, messageId, decodeURIComponent(emoji));
    await notifyMessaging({
      type: 'reaction.removed',
      threadId: msg.threadId,
      messageId,
      emoji: decodeURIComponent(emoji),
      reactorType: actorRef.type,
      reactorId: actorRef.id,
    });
    return reply.code(204).send();
  });

  // ── Read State ──────────────────────────────────────────────────────────────

  app.post('/v1/messaging/threads/:threadId/read', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({ messageId: z.string() }));
    await markRead(ctx, threadId, body.messageId);
    return reply.code(204).send();
  });

  app.post('/v1/messaging/threads/:threadId/unread', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    await markUnread(ctx, threadId);
    return reply.code(204).send();
  });

  // ── Pins ────────────────────────────────────────────────────────────────────

  app.get('/v1/messaging/threads/:threadId/pins', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    return listPins(ctx, threadId);
  });

  app.post('/v1/messaging/threads/:threadId/pins', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({ messageId: z.string() }));
    return pinMessage(ctx, threadId, body.messageId);
  });

  app.delete('/v1/messaging/threads/:threadId/pins/:messageId', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId, messageId } = z.object({ threadId: z.string(), messageId: z.string() }).parse(request.params);
    await unpinMessage(ctx, threadId, messageId);
    return reply.code(204).send();
  });

  // ── Bookmarks ───────────────────────────────────────────────────────────────

  app.get('/v1/messaging/bookmarks', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const query = z.object({ limit: z.coerce.number().max(50).default(30), cursor: z.string().optional() }).parse(request.query);
    return listBookmarks(ctx, query);
  });

  app.post('/v1/messaging/bookmarks', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const body = parseBody(request.body, z.object({ messageId: z.string(), note: z.string().max(500).optional() }));
    return addBookmark(ctx, body.messageId, body.note);
  });

  app.delete('/v1/messaging/bookmarks/:messageId', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    await removeBookmark(ctx, messageId);
    return reply.code(204).send();
  });

  // ── Drafts ──────────────────────────────────────────────────────────────────

  app.get('/v1/messaging/threads/:threadId/draft', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    return getDraft(ctx, threadId);
  });

  app.put('/v1/messaging/threads/:threadId/draft', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({
      content: z.string().max(8000),
      blocks: z.array(z.unknown()).optional(),
      attachments: z.array(z.unknown()).optional(),
    }));
    return saveDraft(ctx, threadId, body);
  });

  app.delete('/v1/messaging/threads/:threadId/draft', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    await deleteDraft(ctx, threadId);
    return reply.code(204).send();
  });

  // ── Search ──────────────────────────────────────────────────────────────────

  app.get('/v1/messaging/search', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const query = z.object({
      q: z.string().min(1).max(200),
      threadId: z.string().optional(),
      after: z.string().datetime().optional(),
      before: z.string().datetime().optional(),
      limit: z.coerce.number().max(50).default(20),
    }).parse(request.query);
    const messages = await searchMessages(ctx, {
      ...query,
      after: query.after ? new Date(query.after) : undefined,
      before: query.before ? new Date(query.before) : undefined,
    });
    return messages.map(serializeMessage);
  });

  // ── New Agent Session ────────────────────────────────────────────────────────
  // Archives the active AgentThread and creates a fresh one. The agent sends a
  // short greeting; it can call messaging.search_history to recall past sessions.

  app.post('/v1/messaging/threads/:threadId/new-session', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    const channelRef = `messaging:${threadId}`;

    // 1. Archive the current active agent thread (if any)
    const prevThread = await db.agentThread.findFirst({
      where: { channelRef, status: 'active' },
      select: { id: true, agentKey: true },
    });

    const agentKey = prevThread?.agentKey ?? 'workshop-assistant';

    if (prevThread) {
      await db.agentThread.update({
        where: { id: prevThread.id },
        data: { status: 'archived' },
      });
    }

    // 2. Create a fresh thread. Seed with an internal prompt so the agent sends a
    //    casual opener without any prior context — it can search history on demand.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seedMessages: any[] = [{
      role: 'user',
      content: 'New session just started. Send a short casual greeting and ask what we\'re working on today. One sentence max. No tool calls.',
    }];

    await db.agentThread.create({
      data: { agentKey, channelRef, messages: seedMessages, metadata: {} },
    });

    // 3. Post SYSTEM divider in the chat log
    const actorType = actor.kind === 'user' ? 'USER' : actor.kind === 'agent' ? 'AGENT' : 'BOT';
    const actorId = actor.kind === 'user' ? actor.userId : actor.kind === 'agent' ? actor.agentKey : actor.botId;
    const seqResult = await db.$queryRaw<[{ seq: bigint | null }]>`
      SELECT MAX("sequenceNumber") as seq FROM "MsgMessage" WHERE "threadId" = ${threadId}
    `;
    const nextSeq = (seqResult[0]?.seq ?? BigInt(0)) + BigInt(1);
    const divider = await db.msgMessage.create({
      data: {
        threadId,
        senderType: actorType,
        senderId: actorId,
        content: '— New session —',
        contentType: 'SYSTEM',
        sequenceNumber: nextSeq,
      },
    });
    await notifyMessaging({
      type: 'message.created',
      threadId,
      message: serializeMessage(divider as unknown as Record<string, unknown>),
    });

    // 4. Trigger the agent (no user text — seed message is already in the thread)
    const triggerFn = await getAgentTrigger();
    if (triggerFn) {
      triggerFn({
        id: divider.id,
        threadId,
        channelId: threadId,
        channelType: 'messaging',
        senderId: actorId,
        senderType: actorType,
        content: '',
        isDm: true, // treat as DM so it always fires workshop-assistant
      }).catch((err: unknown) => {
        console.error('[new-session] agent trigger failed:', err);
      });
    } else {
      await scheduleJob('agent.run', {
        agentKey: 'workshop-assistant',
        trigger: {
          type: 'message',
          mode: 'dm',
          channel: 'messaging',
          threadId,
          text: undefined,
        },
      });
    }

    return reply.code(204).send();
  });

  // ── Typing ──────────────────────────────────────────────────────────────────

  app.post('/v1/messaging/threads/:threadId/typing', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const { threadId } = z.object({ threadId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({ status: z.enum(['start', 'stop']) }));

    const actorRef = actor.kind === 'user'
      ? { type: 'USER', id: actor.userId, name: actor.email }
      : actor.kind === 'agent'
        ? { type: 'AGENT', id: actor.agentKey, name: actor.agentName }
        : { type: 'BOT', id: actor.botId, name: actor.botName };

    await notifyMessaging(
      body.status === 'start'
        ? { type: 'typing.start', threadId, actorType: actorRef.type, actorId: actorRef.id, actorName: actorRef.name }
        : { type: 'typing.stop', threadId, actorType: actorRef.type, actorId: actorRef.id }
    );

    return reply.code(204).send();
  });

  // ── Notifications ───────────────────────────────────────────────────────────

  app.get('/v1/messaging/notifications', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const query = z.object({
      unreadOnly: z.coerce.boolean().default(false),
      limit: z.coerce.number().max(100).default(30),
      cursor: z.string().optional(),
    }).parse(request.query);
    return listNotifications(ctx, query);
  });

  app.patch('/v1/messaging/notifications/:notificationId/read', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    const { notificationId } = z.object({ notificationId: z.string() }).parse(request.params);
    return markNotificationRead(ctx, notificationId);
  });

  app.post('/v1/messaging/notifications/read-all', async (request, reply) => {
    const actor = await requireAuth(request, { botScope: 'messaging.read' });
    const ctx = createServiceContext(actor);
    await markAllNotificationsRead(ctx);
    return reply.code(204).send();
  });

  // ── File Uploads ────────────────────────────────────────────────────────────

  app.post('/v1/messaging/uploads/presign', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const body = parseBody(request.body, z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(100),
      size: z.number().int().positive().max(50 * 1024 * 1024), // 50MB max
    }));

    let storage;
    try {
      storage = getStorageAdapter();
    } catch {
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'File storage is not configured.');
    }

    const ext = body.filename.split('.').pop() ?? 'bin';
    const key = `messaging/attachments/${randomUUID()}.${ext}`;

    const presignedPutUrl = await storage.presignedPut(key, body.mimeType, body.size, 300);

    // Determine attachment type from mimeType
    const type = body.mimeType.startsWith('image/') ? 'image'
      : body.mimeType.startsWith('video/') ? 'video'
      : body.mimeType.startsWith('audio/') ? 'audio'
      : body.mimeType === 'application/pdf' ? 'pdf'
      : 'file';

    const attachment = await registerAttachment(ctx, {
      type,
      filename: `${randomUUID()}.${ext}`,
      originalName: body.filename,
      mimeType: body.mimeType,
      size: body.size,
      storageKey: key,
    });

    return {
      attachmentId: attachment.id,
      presignedPutUrl,
      key,
    };
  });

  app.get('/v1/messaging/attachments/:attachmentId/url', async (request) => {
    await requireAuth(request, { botScope: 'messaging.read' });
    const { attachmentId } = z.object({ attachmentId: z.string() }).parse(request.params);

    const attachment = await getAttachment(attachmentId);
    if (!attachment) throw new ApiError(404, 'NOT_FOUND', 'Attachment not found.');

    let url: string;
    try {
      const storage = getStorageAdapter();
      url = storage.publicUrl(attachment.storageKey) ?? await storage.presignedGet(attachment.storageKey, 3600);
    } catch {
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'File storage is not configured.');
    }

    return { url, expiresIn: 3600 };
  });

  // ── Bot Messaging Config ────────────────────────────────────────────────────

  app.get('/v1/bots/:botId/messaging-config', async (request) => {
    await requireAuth(request, { botScope: 'messaging.read' });
    const { botId } = z.object({ botId: z.string() }).parse(request.params);
    const config = await getBotMessagingConfig(botId);
    return config ?? {};
  });

  app.put('/v1/bots/:botId/messaging-config', async (request) => {
    const actor = await requireAuth(request, { botScope: 'messaging.write' });
    const ctx = createServiceContext(actor);
    const { botId } = z.object({ botId: z.string() }).parse(request.params);
    const body = parseBody(request.body, z.object({
      webhookUrl: z.string().url().nullable().optional(),
      webhookSecret: z.string().min(16).max(256).nullable().optional(),
      webhookEvents: z.array(z.string()).optional(),
      streamingEnabled: z.boolean().optional(),
      typingEnabled: z.boolean().optional(),
      capabilities: z.array(z.string()).optional(),
      onlineStatus: z.enum(['online', 'away', 'offline']).optional(),
    }));
    return upsertBotMessagingConfig(ctx, botId, body);
  });
}
