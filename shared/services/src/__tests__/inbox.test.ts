import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInboxItem, listInbox, markRead, archiveItem, markAllRead } from '../inbox.js';
import type { ServiceContext } from '../context.js';
import type { UserPrincipal, BotPrincipal } from '@hq/auth/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const noPerms = {
  'workshop.view': false,
  'content.all': false,
  'settings.view': false,
  'users.view': false,
  'users.manage': false,
  'admin.surface': false,
  'bots.view': false,
  'bots.create': false,
  'bots.manage.any': false,
  'messaging.view': false,
} as const;

const workshopPerms = { ...noPerms, 'workshop.view': true } as const;

const userActor: UserPrincipal = {
  kind: 'user', source: 'session',
  userId: 'user_1', email: 'u@test.com',
  dbRole: 'MEMBER', effectiveRole: 'MEMBER',
  isSuperadmin: false, scopes: [], permissions: workshopPerms,
};

const otherUser: UserPrincipal = {
  ...userActor, userId: 'user_2', email: 'other@test.com',
};

const botActor: BotPrincipal = {
  kind: 'bot', source: 'apikey',
  apiKeyId: 'k1', botId: 'b1', botSlug: 'my-bot', botName: 'My Bot',
  createdByUserId: 'u1', createdByEmail: 'a@b.com',
  scopes: ['note.read'],
  permissions: noPerms,
};

// ── Mock DB ───────────────────────────────────────────────────────────────────

const store = new Map<string, any>();
let counter = 0;

const mockDb = {
  inboxItem: {
    create: vi.fn(async ({ data }: { data: any }) => {
      const item = { id: `item_${++counter}`, status: 'UNREAD', readAt: null, createdAt: new Date(), ...data };
      store.set(item.id, item);
      return item;
    }),
    findMany: vi.fn(async ({ where }: { where: any }) => {
      return [...store.values()].filter((item) => {
        if (where.recipientUserId && item.recipientUserId !== where.recipientUserId) return false;
        if (where.status) {
          if (typeof where.status === 'string' && item.status !== where.status) return false;
        }
        return true;
      });
    }),
    findUnique: vi.fn(async ({ where }: { where: any }) => store.get(where.id) ?? null),
    update: vi.fn(async ({ where, data }: { where: any; data: any }) => {
      const item = store.get(where.id);
      if (!item) return null;
      const updated = { ...item, ...data };
      store.set(where.id, updated);
      return updated;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
      let count = 0;
      for (const item of store.values()) {
        if (item.recipientUserId === where.recipientUserId && item.status === where.status) {
          store.set(item.id, { ...item, ...data });
          count++;
        }
      }
      return { count };
    }),
  },
};

function makeCtx(actor: UserPrincipal | BotPrincipal): ServiceContext {
  return {
    actor,
    dbClient: mockDb as any,
    now: () => new Date('2024-01-01T10:00:00Z'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

beforeEach(() => {
  store.clear();
  counter = 0;
  vi.clearAllMocks();
});

// ── createInboxItem ───────────────────────────────────────────────────────────

describe('createInboxItem', () => {
  it('creates an item with required fields', async () => {
    const ctx = makeCtx(userActor);
    const item = await createInboxItem(ctx, {
      recipientUserId: 'user_1',
      type: 'task_assigned',
      title: 'You were assigned a task',
    });
    expect(item.recipientUserId).toBe('user_1');
    expect(item.type).toBe('task_assigned');
    expect(item.status).toBe('UNREAD');
    expect(item.body).toBe('');
  });

  it('stores optional fields', async () => {
    const ctx = makeCtx(userActor);
    const item = await createInboxItem(ctx, {
      recipientUserId: 'user_1',
      type: 'approval_requested',
      title: 'Approval needed',
      body: 'Action XYZ needs your approval',
      sourceType: 'ActionApprovalRequest',
      sourceId: 'req_1',
      actionUrl: '/approvals/req_1',
    });
    expect(item.body).toBe('Action XYZ needs your approval');
    expect(item.sourceType).toBe('ActionApprovalRequest');
    expect(item.actionUrl).toBe('/approvals/req_1');
  });
});

// ── listInbox ─────────────────────────────────────────────────────────────────

describe('listInbox', () => {
  it('returns items for the authenticated user', async () => {
    const ctx = makeCtx(userActor);
    await createInboxItem(ctx, { recipientUserId: 'user_1', type: 'mention', title: 'You were mentioned' });
    await createInboxItem(ctx, { recipientUserId: 'user_2', type: 'mention', title: 'Other user' });

    const items = await listInbox(ctx);
    expect(items).toHaveLength(1);
    expect(items[0].recipientUserId).toBe('user_1');
  });

  it('filters by status when provided', async () => {
    const ctx = makeCtx(userActor);
    await createInboxItem(ctx, { recipientUserId: 'user_1', type: 'mention', title: 'A' });
    // manually set one as READ in the store
    const unread = [...store.values()][0];
    store.set(unread.id, { ...unread, status: 'READ' });

    await createInboxItem(ctx, { recipientUserId: 'user_1', type: 'mention', title: 'B' });

    const unreadItems = await listInbox(ctx, { status: 'UNREAD' });
    expect(unreadItems).toHaveLength(1);
  });

  it('throws for non-user principals', async () => {
    const ctx = makeCtx(botActor);
    await expect(listInbox(ctx)).rejects.toThrow('only available for user principals');
  });
});

// ── markRead ──────────────────────────────────────────────────────────────────

describe('markRead', () => {
  it('marks an item as READ and sets readAt', async () => {
    const ctx = makeCtx(userActor);
    const created = await createInboxItem(ctx, { recipientUserId: 'user_1', type: 'mention', title: 'Ping' });

    const updated = await markRead(ctx, created.id);
    expect(updated.status).toBe('READ');
    expect(updated.readAt).toEqual(new Date('2024-01-01T10:00:00Z'));
  });

  it('throws if item not found', async () => {
    const ctx = makeCtx(userActor);
    await expect(markRead(ctx, 'nonexistent')).rejects.toThrow('not found');
  });

  it('throws if item belongs to another user', async () => {
    const ctx = makeCtx(userActor);
    const created = await createInboxItem(ctx, { recipientUserId: 'user_2', type: 'mention', title: 'Other' });

    const ctxOther = makeCtx(otherUser);
    // seed the item directly so listInbox won't intercept
    await expect(markRead(ctx, created.id)).rejects.toThrow('not found');
  });

  it('throws for non-user principals', async () => {
    const ctx = makeCtx(botActor);
    await expect(markRead(ctx, 'id_1')).rejects.toThrow('only available for user principals');
  });
});

// ── archiveItem ───────────────────────────────────────────────────────────────

describe('archiveItem', () => {
  it('sets status to ARCHIVED', async () => {
    const ctx = makeCtx(userActor);
    const created = await createInboxItem(ctx, { recipientUserId: 'user_1', type: 'mention', title: 'Old' });
    const updated = await archiveItem(ctx, created.id);
    expect(updated.status).toBe('ARCHIVED');
  });

  it('throws if item belongs to another user', async () => {
    const senderCtx = makeCtx(otherUser);
    const created = await createInboxItem(senderCtx, { recipientUserId: 'user_2', type: 'mention', title: 'Not mine' });

    const ctx = makeCtx(userActor);
    await expect(archiveItem(ctx, created.id)).rejects.toThrow('not found');
  });

  it('throws for non-user principals', async () => {
    const ctx = makeCtx(botActor);
    await expect(archiveItem(ctx, 'id_1')).rejects.toThrow('only available for user principals');
  });
});

// ── markAllRead ───────────────────────────────────────────────────────────────

describe('markAllRead', () => {
  it('marks all UNREAD items for the user as READ', async () => {
    const ctx = makeCtx(userActor);
    await createInboxItem(ctx, { recipientUserId: 'user_1', type: 'mention', title: 'A' });
    await createInboxItem(ctx, { recipientUserId: 'user_1', type: 'mention', title: 'B' });
    await createInboxItem(ctx, { recipientUserId: 'user_2', type: 'mention', title: 'Other' });

    const result = await markAllRead(ctx);
    expect(result.count).toBe(2);
  });

  it('throws for non-user principals', async () => {
    const ctx = makeCtx(botActor);
    await expect(markAllRead(ctx)).rejects.toThrow('only available for user principals');
  });
});
