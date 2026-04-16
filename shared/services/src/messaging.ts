import { db } from '@hq/db';
import type {
  MsgActorType,
  MsgContentType,
  MsgThread,
  MsgParticipant,
  MsgMessage,
  MsgAttachment,
  MsgReaction,
  MsgPin,
  MsgBookmark,
  MsgNotification,
  MsgDelivery,
  MsgDraft,
  BotMessagingConfig,
} from '@hq/db';
import type { ServiceContext } from './context.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ActorRef = { type: MsgActorType; id: string };

export type ThreadWithMeta = MsgThread & {
  participants: MsgParticipant[];
  _count: { messages: number; pins: number };
  lastMessage?: Pick<MsgMessage, 'id' | 'content' | 'senderType' | 'senderId' | 'contentType' | 'createdAt'> | null;
  unreadCount?: number;
};

export type MessageWithRelations = MsgMessage & {
  attachments: MsgAttachment[];
  reactions: ReactionGroup[];
  replyCount: number;
};

export type ReactionGroup = {
  emoji: string;
  count: number;
  reactors: ActorRef[];
  selfReacted: boolean;
};

export type SendMessageInput = {
  content?: string;
  contentType?: MsgContentType;
  blocks?: unknown[];
  parentMessageId?: string;
  attachmentIds?: string[];
  metadata?: Record<string, unknown>;
  streamingStatus?: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function actorFromCtx(ctx: ServiceContext): ActorRef {
  if (ctx.actor.kind === 'user') {
    return { type: 'USER', id: ctx.actor.userId };
  }
  if (ctx.actor.kind === 'agent') {
    return { type: 'AGENT', id: ctx.actor.agentKey };
  }
  return { type: 'BOT', id: ctx.actor.botId };
}

async function assertParticipant(threadId: string, actor: ActorRef): Promise<MsgParticipant> {
  const p = await db.msgParticipant.findUnique({
    where: {
      threadId_actorType_actorId: { threadId, actorType: actor.type, actorId: actor.id },
    },
  });
  if (!p || p.leftAt) {
    throw new Error(`Not found: not a participant in thread '${threadId}'.`);
  }
  return p;
}

async function assertParticipantAdmin(threadId: string, actor: ActorRef): Promise<void> {
  const p = await assertParticipant(threadId, actor);
  if (p.role !== 'admin') {
    throw new Error(`Forbidden: admin role required to modify thread '${threadId}'.`);
  }
}

async function nextSequenceNumber(threadId: string): Promise<bigint> {
  // Use Postgres advisory lock to guarantee monotonic sequence per thread
  const lockKey = `msg_seq_${threadId}`;
  const result = await db.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval(('msg_seq_' || ${threadId})::regclass) as nextval
  `.catch(async () => {
    // Sequence doesn't exist yet — create it
    await db.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "msg_seq_${threadId.replace(/-/g, '_')}" START 1`
    );
    return db.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval(('msg_seq_' || ${threadId})::regclass) as nextval
    `;
  });
  return result[0]?.nextval ?? BigInt(Date.now());
}

// Simpler approach: use MAX(sequenceNumber) + 1 with advisory lock
async function getNextSeq(threadId: string): Promise<bigint> {
  const rows = await db.$queryRaw<{ seq: bigint | null }[]>`
    SELECT MAX("sequenceNumber") as seq FROM "MsgMessage" WHERE "threadId" = ${threadId}
  `;
  const current = rows[0]?.seq ?? BigInt(0);
  return current + BigInt(1);
}

function groupReactions(reactions: MsgReaction[], selfActor: ActorRef): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const r of reactions) {
    if (!map.has(r.emoji)) {
      map.set(r.emoji, { emoji: r.emoji, count: 0, reactors: [], selfReacted: false });
    }
    const group = map.get(r.emoji)!;
    group.count++;
    group.reactors.push({ type: r.reactorType, id: r.reactorId });
    if (r.reactorType === selfActor.type && r.reactorId === selfActor.id) {
      group.selfReacted = true;
    }
  }
  return Array.from(map.values());
}

// ─── Threads ─────────────────────────────────────────────────────────────────

export async function createThread(
  ctx: ServiceContext,
  input: {
    type?: 'DM' | 'GROUP' | 'CHANNEL';
    name?: string;
    description?: string;
    iconEmoji?: string;
    participants: ActorRef[];
  }
): Promise<MsgThread> {
  const actor = actorFromCtx(ctx);
  const type = input.type ?? (input.participants.length <= 2 ? 'DM' : 'GROUP');

  // DM uniqueness: return existing thread if one already exists with exact same participants
  if (type === 'DM') {
    const allParticipants: ActorRef[] = [
      { type: actor.type, id: actor.id },
      ...input.participants.filter((p) => !(p.type === actor.type && p.id === actor.id)),
    ];

    // Find threads where actor is a participant
    const candidateThreadIds = await db.msgParticipant.findMany({
      where: { actorType: actor.type, actorId: actor.id, leftAt: null },
      select: { threadId: true },
    });

    if (candidateThreadIds.length > 0) {
      const candidates = await db.msgThread.findMany({
        where: {
          id: { in: candidateThreadIds.map((p) => p.threadId) },
          type: 'DM',
          isArchived: false,
        },
        include: { participants: { where: { leftAt: null }, select: { actorType: true, actorId: true } } },
      });

      for (const candidate of candidates) {
        const cParticipants = candidate.participants;
        if (cParticipants.length !== allParticipants.length) continue;
        const allMatch = allParticipants.every((ap) =>
          cParticipants.some((cp) => cp.actorType === ap.type && cp.actorId === ap.id)
        );
        if (allMatch) return candidate;
      }
    }
  }

  const thread = await db.msgThread.create({
    data: {
      type,
      name: input.name,
      description: input.description,
      iconEmoji: input.iconEmoji,
      createdByType: actor.type,
      createdById: actor.id,
      participants: {
        create: [
          // Creator is always admin
          { actorType: actor.type, actorId: actor.id, role: 'admin' },
          // Other participants
          ...input.participants
            .filter((p) => !(p.type === actor.type && p.id === actor.id))
            .map((p) => ({ actorType: p.type, actorId: p.id, role: 'member', addedByType: actor.type, addedById: actor.id })),
        ],
      },
    },
  });

  // Insert system message
  await db.msgMessage.create({
    data: {
      threadId: thread.id,
      senderType: actor.type,
      senderId: actor.id,
      content: 'Thread created',
      contentType: 'SYSTEM',
      sequenceNumber: BigInt(1),
    },
  });

  return thread;
}

export async function getThread(
  ctx: ServiceContext,
  threadId: string
): Promise<ThreadWithMeta> {
  const actor = actorFromCtx(ctx);
  await assertParticipant(threadId, actor);

  const thread = await db.msgThread.findUniqueOrThrow({
    where: { id: threadId },
    include: {
      participants: true,
      _count: { select: { messages: true, pins: true } },
    },
  });

  const lastMessage = await db.msgMessage.findFirst({
    where: { threadId, isDeleted: false },
    orderBy: { sequenceNumber: 'desc' },
    select: { id: true, content: true, senderType: true, senderId: true, contentType: true, createdAt: true },
  });

  const participant = thread.participants.find(
    (p) => p.actorType === actor.type && p.actorId === actor.id
  );
  const unreadCount = participant?.lastReadMessageId
    ? await db.msgMessage.count({
        where: {
          threadId,
          isDeleted: false,
          parentMessageId: null,
          sequenceNumber: {
            gt: (await db.msgMessage.findUnique({ where: { id: participant.lastReadMessageId }, select: { sequenceNumber: true } }))?.sequenceNumber ?? BigInt(0),
          },
        },
      })
    : 0; // No read state → treat as fully read (avoids showing total count as unread)

  return { ...thread, lastMessage: lastMessage ?? null, unreadCount };
}

export async function listThreadsForActor(
  ctx: ServiceContext,
  input: { limit?: number; cursor?: string } = {}
): Promise<ThreadWithMeta[]> {
  const actor = actorFromCtx(ctx);
  const limit = input.limit ?? 30;

  const participations = await db.msgParticipant.findMany({
    where: { actorType: actor.type, actorId: actor.id, leftAt: null },
    include: {
      thread: {
        include: {
          participants: true,
          _count: { select: { messages: true, pins: true } },
        },
      },
    },
    orderBy: { thread: { lastMessageAt: 'desc' } },
    take: limit,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });

  const results: ThreadWithMeta[] = [];
  for (const p of participations) {
    const lastMessage = await db.msgMessage.findFirst({
      where: { threadId: p.thread.id, isDeleted: false },
      orderBy: { sequenceNumber: 'desc' },
      select: { id: true, content: true, senderType: true, senderId: true, contentType: true, createdAt: true },
    });

    const unreadCount = p.lastReadMessageId
      ? await db.msgMessage.count({
          where: {
            threadId: p.thread.id,
            isDeleted: false,
            parentMessageId: null,
            sequenceNumber: {
              gt: (await db.msgMessage.findUnique({ where: { id: p.lastReadMessageId }, select: { sequenceNumber: true } }))?.sequenceNumber ?? BigInt(0),
            },
          },
        })
      : 0; // No read state → treat as fully read

    results.push({ ...p.thread, lastMessage: lastMessage ?? null, unreadCount });
  }

  return results;
}

export async function updateThread(
  ctx: ServiceContext,
  threadId: string,
  input: { name?: string; description?: string; avatarUrl?: string; iconEmoji?: string }
): Promise<MsgThread> {
  const actor = actorFromCtx(ctx);
  await assertParticipantAdmin(threadId, actor);
  return db.msgThread.update({ where: { id: threadId }, data: input });
}

export async function archiveThread(ctx: ServiceContext, threadId: string): Promise<MsgThread> {
  const actor = actorFromCtx(ctx);
  await assertParticipantAdmin(threadId, actor);
  return db.msgThread.update({
    where: { id: threadId },
    data: { isArchived: true, archivedAt: new Date() },
  });
}

// ─── Participants ─────────────────────────────────────────────────────────────

export async function addParticipant(
  ctx: ServiceContext,
  threadId: string,
  target: ActorRef,
  role: 'admin' | 'member' = 'member'
): Promise<MsgParticipant> {
  const actor = actorFromCtx(ctx);
  await assertParticipant(threadId, actor);

  return db.msgParticipant.upsert({
    where: { threadId_actorType_actorId: { threadId, actorType: target.type, actorId: target.id } },
    update: { leftAt: null, role, addedByType: actor.type, addedById: actor.id },
    create: { threadId, actorType: target.type, actorId: target.id, role, addedByType: actor.type, addedById: actor.id },
  });
}

export async function removeParticipant(
  ctx: ServiceContext,
  threadId: string,
  target: ActorRef
): Promise<void> {
  const actor = actorFromCtx(ctx);
  // Can remove self, or admin can remove anyone
  if (!(target.type === actor.type && target.id === actor.id)) {
    await assertParticipantAdmin(threadId, actor);
  }
  await db.msgParticipant.updateMany({
    where: { threadId, actorType: target.type, actorId: target.id },
    data: { leftAt: new Date() },
  });
}

export async function updateParticipantSettings(
  ctx: ServiceContext,
  threadId: string,
  target: ActorRef,
  input: { isMuted?: boolean; notifyLevel?: string; role?: string }
): Promise<MsgParticipant> {
  const actor = actorFromCtx(ctx);
  if (input.role) await assertParticipantAdmin(threadId, actor);
  return db.msgParticipant.update({
    where: { threadId_actorType_actorId: { threadId, actorType: target.type, actorId: target.id } },
    data: input,
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function sendMessage(
  ctx: ServiceContext,
  threadId: string,
  input: SendMessageInput
): Promise<MessageWithRelations> {
  const actor = actorFromCtx(ctx);
  await assertParticipant(threadId, actor);

  const seq = await getNextSeq(threadId);

  const message = await db.msgMessage.create({
    data: {
      threadId,
      senderType: actor.type,
      senderId: actor.id,
      content: input.content ?? '',
      contentType: input.contentType ?? 'TEXT',
      blocks: (input.blocks ?? []) as object[],
      parentMessageId: input.parentMessageId,
      sequenceNumber: seq,
      ...(input.metadata ? { metadata: input.metadata as object } : {}),
      ...(input.streamingStatus !== undefined ? { streamingStatus: input.streamingStatus } : {}),
    },
    include: { attachments: true, reactions: true },
  });

  // Link pending attachments to this message
  if (input.attachmentIds?.length) {
    await db.msgAttachment.updateMany({
      where: { id: { in: input.attachmentIds }, messageId: { equals: undefined } },
      data: { messageId: message.id },
    });
  }

  // Increment parent replyCount
  if (input.parentMessageId) {
    await db.msgMessage.update({
      where: { id: input.parentMessageId },
      data: { replyCount: { increment: 1 } },
    });
  }

  // Update thread lastMessage
  await db.msgThread.update({
    where: { id: threadId },
    data: { lastMessageAt: message.createdAt, lastMessageId: message.id },
  });

  return {
    ...message,
    reactions: [],
    replyCount: message.replyCount,
  };
}

export async function editMessage(
  ctx: ServiceContext,
  messageId: string,
  input: { content?: string; blocks?: unknown[] }
): Promise<MsgMessage> {
  const actor = actorFromCtx(ctx);
  const msg = await db.msgMessage.findUniqueOrThrow({ where: { id: messageId } });

  if (msg.senderType !== actor.type || msg.senderId !== actor.id) {
    throw new Error('Forbidden: can only edit own messages.');
  }
  if (msg.isDeleted) throw new Error('Cannot edit a deleted message.');

  return db.msgMessage.update({
    where: { id: messageId },
    data: {
      content: input.content ?? msg.content,
      blocks: (input.blocks ?? msg.blocks) as object[],
      isEdited: true,
      editedAt: new Date(),
    },
  });
}

export async function deleteMessage(ctx: ServiceContext, messageId: string): Promise<MsgMessage> {
  const actor = actorFromCtx(ctx);
  const msg = await db.msgMessage.findUniqueOrThrow({ where: { id: messageId } });

  // Admins can delete any message; others only own
  const participant = await db.msgParticipant.findUnique({
    where: { threadId_actorType_actorId: { threadId: msg.threadId, actorType: actor.type, actorId: actor.id } },
  });
  const isAdmin = participant?.role === 'admin';
  const isOwner = msg.senderType === actor.type && msg.senderId === actor.id;

  if (!isAdmin && !isOwner) {
    throw new Error('Forbidden: cannot delete this message.');
  }

  return db.msgMessage.update({
    where: { id: messageId },
    data: { isDeleted: true, deletedAt: new Date(), content: '', blocks: [] },
  });
}

export async function listMessages(
  ctx: ServiceContext,
  threadId: string,
  input: { cursor?: string; limit?: number; direction?: 'before' | 'after' } = {}
): Promise<MessageWithRelations[]> {
  const actor = actorFromCtx(ctx);
  await assertParticipant(threadId, actor);

  const limit = input.limit ?? 50;
  const direction = input.direction ?? 'before';

  let cursorSeq: bigint | undefined;
  if (input.cursor) {
    const cursorMsg = await db.msgMessage.findUnique({
      where: { id: input.cursor },
      select: { sequenceNumber: true },
    });
    cursorSeq = cursorMsg?.sequenceNumber;
  }

  const messages = await db.msgMessage.findMany({
    where: {
      threadId,
      parentMessageId: null,
      ...(cursorSeq !== undefined
        ? direction === 'before'
          ? { sequenceNumber: { lt: cursorSeq } }
          : { sequenceNumber: { gt: cursorSeq } }
        : {}),
    },
    include: { attachments: true, reactions: true },
    orderBy: { sequenceNumber: direction === 'before' ? 'desc' : 'asc' },
    take: limit,
  });

  const ordered = direction === 'before' ? messages.reverse() : messages;
  return ordered.map((m) => ({
    ...m,
    reactions: groupReactions(m.reactions, actor),
    replyCount: m.replyCount,
  }));
}

export async function getMessageReplies(
  ctx: ServiceContext,
  parentMessageId: string,
  input: { cursor?: string; limit?: number } = {}
): Promise<MessageWithRelations[]> {
  const actor = actorFromCtx(ctx);
  const parent = await db.msgMessage.findUniqueOrThrow({ where: { id: parentMessageId } });
  await assertParticipant(parent.threadId, actor);

  const limit = input.limit ?? 50;
  const messages = await db.msgMessage.findMany({
    where: { parentMessageId },
    include: { attachments: true, reactions: true },
    orderBy: { sequenceNumber: 'asc' },
    take: limit,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });

  return messages.map((m) => ({
    ...m,
    reactions: groupReactions(m.reactions, actor),
    replyCount: m.replyCount,
  }));
}

// ─── Streaming (for bots) ──────────────────────────────────────────────────

export async function startStreamingMessage(
  ctx: ServiceContext,
  threadId: string
): Promise<MsgMessage> {
  const actor = actorFromCtx(ctx);
  await assertParticipant(threadId, actor);

  const seq = await getNextSeq(threadId);
  return db.msgMessage.create({
    data: {
      threadId,
      senderType: actor.type,
      senderId: actor.id,
      content: '',
      contentType: 'TEXT',
      blocks: [],
      sequenceNumber: seq,
      streamingStatus: 'streaming',
    },
  });
}

export async function finishStreamingMessage(
  ctx: ServiceContext,
  messageId: string,
  input: { content: string; blocks?: unknown[] }
): Promise<MsgMessage> {
  const actor = actorFromCtx(ctx);
  const msg = await db.msgMessage.findUniqueOrThrow({ where: { id: messageId } });

  if (msg.senderType !== actor.type || msg.senderId !== actor.id) {
    throw new Error('Forbidden: can only finish own streaming messages.');
  }

  const updated = await db.msgMessage.update({
    where: { id: messageId },
    data: {
      content: input.content,
      blocks: (input.blocks ?? []) as object[],
      streamingStatus: null,
    },
  });

  await db.msgThread.update({
    where: { id: msg.threadId },
    data: { lastMessageAt: updated.updatedAt, lastMessageId: messageId },
  });

  return updated;
}

// ─── Reactions ────────────────────────────────────────────────────────────────

export async function addReaction(
  ctx: ServiceContext,
  messageId: string,
  emoji: string
): Promise<ReactionGroup[]> {
  const actor = actorFromCtx(ctx);
  const msg = await db.msgMessage.findUniqueOrThrow({ where: { id: messageId } });
  await assertParticipant(msg.threadId, actor);

  await db.msgReaction.upsert({
    where: { messageId_emoji_reactorType_reactorId: { messageId, emoji, reactorType: actor.type, reactorId: actor.id } },
    update: {},
    create: { messageId, emoji, reactorType: actor.type, reactorId: actor.id },
  });

  const reactions = await db.msgReaction.findMany({ where: { messageId } });
  return groupReactions(reactions, actor);
}

export async function removeReaction(
  ctx: ServiceContext,
  messageId: string,
  emoji: string
): Promise<ReactionGroup[]> {
  const actor = actorFromCtx(ctx);
  const msg = await db.msgMessage.findUniqueOrThrow({ where: { id: messageId } });
  await assertParticipant(msg.threadId, actor);

  await db.msgReaction.deleteMany({
    where: { messageId, emoji, reactorType: actor.type, reactorId: actor.id },
  });

  const reactions = await db.msgReaction.findMany({ where: { messageId } });
  return groupReactions(reactions, actor);
}

// ─── Read State ───────────────────────────────────────────────────────────────

export async function markRead(
  ctx: ServiceContext,
  threadId: string,
  messageId: string
): Promise<void> {
  const actor = actorFromCtx(ctx);
  await db.msgParticipant.updateMany({
    where: { threadId, actorType: actor.type, actorId: actor.id },
    data: { lastReadAt: new Date(), lastReadMessageId: messageId },
  });
}

export async function markUnread(ctx: ServiceContext, threadId: string): Promise<void> {
  const actor = actorFromCtx(ctx);
  await db.msgParticipant.updateMany({
    where: { threadId, actorType: actor.type, actorId: actor.id },
    data: { lastReadAt: null, lastReadMessageId: null },
  });
}

// ─── Pins ─────────────────────────────────────────────────────────────────────

export async function pinMessage(
  ctx: ServiceContext,
  threadId: string,
  messageId: string
): Promise<MsgPin> {
  const actor = actorFromCtx(ctx);
  await assertParticipant(threadId, actor);

  return db.msgPin.upsert({
    where: { threadId_messageId: { threadId, messageId } },
    update: { pinnedByType: actor.type, pinnedById: actor.id, pinnedAt: new Date() },
    create: { threadId, messageId, pinnedByType: actor.type, pinnedById: actor.id },
  });
}

export async function unpinMessage(ctx: ServiceContext, threadId: string, messageId: string): Promise<void> {
  await assertParticipant(threadId, actorFromCtx(ctx));
  await db.msgPin.deleteMany({ where: { threadId, messageId } });
}

export async function listPins(
  ctx: ServiceContext,
  threadId: string
): Promise<(MsgPin & { message: MsgMessage & { attachments: MsgAttachment[] } })[]> {
  await assertParticipant(threadId, actorFromCtx(ctx));
  return db.msgPin.findMany({
    where: { threadId },
    include: { message: { include: { attachments: true } } },
    orderBy: { pinnedAt: 'desc' },
  });
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export async function addBookmark(
  ctx: ServiceContext,
  messageId: string,
  note?: string
): Promise<MsgBookmark> {
  const actor = actorFromCtx(ctx);
  const msg = await db.msgMessage.findUniqueOrThrow({ where: { id: messageId } });
  const participant = await assertParticipant(msg.threadId, actor);

  return db.msgBookmark.upsert({
    where: { participantId_messageId: { participantId: participant.id, messageId } },
    update: { note },
    create: { participantId: participant.id, messageId, note },
  });
}

export async function removeBookmark(ctx: ServiceContext, messageId: string): Promise<void> {
  const actor = actorFromCtx(ctx);
  const msg = await db.msgMessage.findUniqueOrThrow({ where: { id: messageId } });
  const participant = await assertParticipant(msg.threadId, actor);
  await db.msgBookmark.deleteMany({
    where: { participantId: participant.id, messageId },
  });
}

export async function listBookmarks(
  ctx: ServiceContext,
  input: { limit?: number; cursor?: string } = {}
): Promise<(MsgBookmark & { message: MsgMessage & { attachments: MsgAttachment[] } })[]> {
  const actor = actorFromCtx(ctx);
  const limit = input.limit ?? 30;

  return db.msgBookmark.findMany({
    where: {
      participant: { actorType: actor.type, actorId: actor.id },
    },
    include: { message: { include: { attachments: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
}

// ─── Drafts ────────────────────────────────────────────────────────────────────

export async function saveDraft(
  ctx: ServiceContext,
  threadId: string,
  input: { content: string; blocks?: unknown[]; attachments?: unknown[] }
): Promise<MsgDraft> {
  const actor = actorFromCtx(ctx);
  return db.msgDraft.upsert({
    where: { threadId_actorType_actorId: { threadId, actorType: actor.type, actorId: actor.id } },
    update: {
      content: input.content,
      blocks: (input.blocks ?? []) as object[],
      attachments: (input.attachments ?? []) as object[],
    },
    create: {
      threadId,
      actorType: actor.type,
      actorId: actor.id,
      content: input.content,
      blocks: (input.blocks ?? []) as object[],
      attachments: (input.attachments ?? []) as object[],
    },
  });
}

export async function getDraft(
  ctx: ServiceContext,
  threadId: string
): Promise<MsgDraft | null> {
  const actor = actorFromCtx(ctx);
  return db.msgDraft.findUnique({
    where: { threadId_actorType_actorId: { threadId, actorType: actor.type, actorId: actor.id } },
  });
}

export async function deleteDraft(ctx: ServiceContext, threadId: string): Promise<void> {
  const actor = actorFromCtx(ctx);
  await db.msgDraft.deleteMany({
    where: { threadId, actorType: actor.type, actorId: actor.id },
  });
}

// ─── Search ────────────────────────────────────────────────────────────────────

export async function searchMessages(
  ctx: ServiceContext,
  input: {
    q: string;
    threadId?: string;
    after?: Date;
    before?: Date;
    limit?: number;
  }
): Promise<(MsgMessage & { attachments: MsgAttachment[] })[]> {
  const actor = actorFromCtx(ctx);
  const limit = Math.min(input.limit ?? 20, 50);

  // Get thread IDs the actor participates in
  const participations = await db.msgParticipant.findMany({
    where: { actorType: actor.type, actorId: actor.id, leftAt: null },
    select: { threadId: true },
  });
  const accessibleThreadIds = participations.map((p) => p.threadId);

  const targetThreadIds = input.threadId
    ? accessibleThreadIds.includes(input.threadId) ? [input.threadId] : []
    : accessibleThreadIds;

  if (targetThreadIds.length === 0) return [];

  // Use Postgres full-text search
  const results = await db.$queryRaw<(MsgMessage & { rank: number })[]>`
    SELECT *, ts_rank("searchVec", plainto_tsquery('english', ${input.q})) as rank
    FROM "MsgMessage"
    WHERE
      "threadId" = ANY(${targetThreadIds}::text[])
      AND "isDeleted" = false
      AND "searchVec" @@ plainto_tsquery('english', ${input.q})
      ${input.after ? db.$queryRaw`AND "createdAt" > ${input.after}` : db.$queryRaw``}
      ${input.before ? db.$queryRaw`AND "createdAt" < ${input.before}` : db.$queryRaw``}
    ORDER BY rank DESC, "createdAt" DESC
    LIMIT ${limit}
  `;

  const messageIds = results.map((r) => r.id);
  if (messageIds.length === 0) return [];

  return db.msgMessage.findMany({
    where: { id: { in: messageIds } },
    include: { attachments: true },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function listNotifications(
  ctx: ServiceContext,
  input: { unreadOnly?: boolean; limit?: number; cursor?: string } = {}
): Promise<MsgNotification[]> {
  const actor = actorFromCtx(ctx);
  const limit = input.limit ?? 30;

  return db.msgNotification.findMany({
    where: {
      recipientType: actor.type,
      recipientId: actor.id,
      ...(input.unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
}

export async function markNotificationRead(
  ctx: ServiceContext,
  notificationId: string
): Promise<MsgNotification> {
  const actor = actorFromCtx(ctx);
  const notif = await db.msgNotification.findUniqueOrThrow({ where: { id: notificationId } });
  if (notif.recipientType !== actor.type || notif.recipientId !== actor.id) {
    throw new Error('Forbidden: cannot mark another actor\'s notification as read.');
  }
  return db.msgNotification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markAllNotificationsRead(ctx: ServiceContext): Promise<void> {
  const actor = actorFromCtx(ctx);
  await db.msgNotification.updateMany({
    where: { recipientType: actor.type, recipientId: actor.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function createNotification(input: {
  recipientType: MsgActorType;
  recipientId: string;
  type: string;
  threadId?: string;
  messageId?: string;
  title: string;
  body: string;
  metadata?: object;
}): Promise<MsgNotification> {
  return db.msgNotification.create({
    data: {
      recipientType: input.recipientType,
      recipientId: input.recipientId,
      type: input.type,
      threadId: input.threadId,
      messageId: input.messageId,
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? {},
    },
  });
}

// ─── Bot Messaging Config ──────────────────────────────────────────────────────

export async function getBotMessagingConfig(botId: string): Promise<BotMessagingConfig | null> {
  return db.botMessagingConfig.findUnique({ where: { botId } });
}

export async function upsertBotMessagingConfig(
  ctx: ServiceContext,
  botId: string,
  input: {
    webhookUrl?: string | null;
    webhookSecret?: string | null;
    webhookEvents?: string[];
    streamingEnabled?: boolean;
    typingEnabled?: boolean;
    capabilities?: string[];
    onlineStatus?: string;
  }
): Promise<BotMessagingConfig> {
  return db.botMessagingConfig.upsert({
    where: { botId },
    update: input,
    create: { botId, ...input },
  });
}

export async function setBotOnlineStatus(botId: string, status: 'online' | 'away' | 'offline'): Promise<void> {
  await db.botMessagingConfig.upsert({
    where: { botId },
    update: { onlineStatus: status, lastSeenAt: new Date() },
    create: { botId, onlineStatus: status, lastSeenAt: new Date() },
  });
}

// ─── Attachment Registration ───────────────────────────────────────────────────

export async function registerAttachment(
  ctx: ServiceContext,
  input: {
    type: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    storageKey: string;
    width?: number;
    height?: number;
    durationMs?: number;
  }
): Promise<MsgAttachment> {
  const actor = actorFromCtx(ctx);
  // messageId is set when the message is sent
  return db.msgAttachment.create({
    data: {
      messageId: 'pending', // will be updated on sendMessage
      type: input.type,
      filename: input.filename,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      storageKey: input.storageKey,
      width: input.width,
      height: input.height,
      durationMs: input.durationMs,
      uploadedByType: actor.type,
      uploadedById: actor.id,
    },
  });
}

export async function getAttachment(id: string): Promise<MsgAttachment | null> {
  return db.msgAttachment.findUnique({ where: { id } });
}
