import type { ServiceContext } from './context.js';

export interface CreateInboxItemInput {
  recipientUserId: string;
  type: string;
  title: string;
  body?: string;
  sourceType?: string;
  sourceId?: string;
  actionUrl?: string;
}

export async function createInboxItem(
  ctx: ServiceContext,
  input: CreateInboxItemInput,
) {
  return ctx.dbClient.inboxItem.create({
    data: {
      recipientUserId: input.recipientUserId,
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      actionUrl: input.actionUrl ?? null,
    },
  });
}

export interface ListInboxOptions {
  status?: 'UNREAD' | 'READ' | 'ARCHIVED';
  limit?: number;
}

export async function listInbox(ctx: ServiceContext, opts?: ListInboxOptions) {
  if (ctx.actor.kind !== 'user') {
    throw new Error('Inbox is only available for user principals.');
  }
  return ctx.dbClient.inboxItem.findMany({
    where: {
      recipientUserId: ctx.actor.userId,
      ...(opts?.status ? { status: opts.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts?.limit ?? 50,
  });
}

export async function markRead(ctx: ServiceContext, id: string) {
  if (ctx.actor.kind !== 'user') throw new Error('Inbox is only available for user principals.');
  const item = await ctx.dbClient.inboxItem.findUnique({ where: { id } });
  if (!item || item.recipientUserId !== ctx.actor.userId) {
    throw new Error('Inbox item not found.');
  }
  return ctx.dbClient.inboxItem.update({
    where: { id },
    data: { status: 'READ', readAt: ctx.now() },
  });
}

export async function archiveItem(ctx: ServiceContext, id: string) {
  if (ctx.actor.kind !== 'user') throw new Error('Inbox is only available for user principals.');
  const item = await ctx.dbClient.inboxItem.findUnique({ where: { id } });
  if (!item || item.recipientUserId !== ctx.actor.userId) {
    throw new Error('Inbox item not found.');
  }
  return ctx.dbClient.inboxItem.update({
    where: { id },
    data: { status: 'ARCHIVED' },
  });
}

export async function markAllRead(ctx: ServiceContext) {
  if (ctx.actor.kind !== 'user') throw new Error('Inbox is only available for user principals.');
  return ctx.dbClient.inboxItem.updateMany({
    where: { recipientUserId: ctx.actor.userId, status: 'UNREAD' },
    data: { status: 'READ', readAt: ctx.now() },
  });
}
