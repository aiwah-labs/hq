import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @hq/services to prevent circular deps
vi.mock('@hq/services', () => ({
  createServiceContext: vi.fn(),
}));

const { emitEvent } = await import('../emit.js');

// ── Mock DB ──────────────────────────────────────────────────────────────────

function makeDb() {
  return {
    platformEvent: {
      create: vi.fn().mockResolvedValue({ id: 'evt_1', type: 'test' }),
    },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
  };
}

function makeCtx(actor: any) {
  const db = makeDb();
  return {
    ctx: {
      actor,
      dbClient: db as any,
      now: () => new Date(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
    db,
  };
}

describe('emitEvent', () => {
  it('creates a platform event in the database', async () => {
    const { ctx, db } = makeCtx({ kind: 'user', userId: 'user_1' });

    await emitEvent(ctx as any, 'company.created', {
      objectType: 'Company',
      objectId: 'cmp_1',
      payload: { name: 'Acme' },
    });

    expect(db.platformEvent.create).toHaveBeenCalledOnce();
    const data = db.platformEvent.create.mock.calls[0][0].data;
    expect(data.type).toBe('company.created');
    expect(data.actorType).toBe('user');
    expect(data.actorId).toBe('user_1');
    expect(data.objectType).toBe('Company');
    expect(data.objectId).toBe('cmp_1');
    expect(data.payload).toEqual({ name: 'Acme' });
  });

  it('resolves actorId for bot principals', async () => {
    const { ctx, db } = makeCtx({ kind: 'bot', botId: 'bot_1' });

    await emitEvent(ctx as any, 'note.created', {});

    const data = db.platformEvent.create.mock.calls[0][0].data;
    expect(data.actorType).toBe('bot');
    expect(data.actorId).toBe('bot_1');
  });

  it('resolves actorId for agent principals', async () => {
    const { ctx, db } = makeCtx({ kind: 'agent', agentKey: 'workshop-assistant' });

    await emitEvent(ctx as any, 'workflow.completed', {});

    const data = db.platformEvent.create.mock.calls[0][0].data;
    expect(data.actorType).toBe('agent');
    expect(data.actorId).toBe('workshop-assistant');
  });

  it('sends pg_notify after creating the event', async () => {
    const { ctx, db } = makeCtx({ kind: 'user', userId: 'u1' });

    await emitEvent(ctx as any, 'test.event', { objectType: 'Test', objectId: 't1' });

    expect(db.$executeRaw).toHaveBeenCalledOnce();
  });

  it('defaults payload to empty object when not provided', async () => {
    const { ctx, db } = makeCtx({ kind: 'user', userId: 'u1' });

    await emitEvent(ctx as any, 'test.event', {});

    const data = db.platformEvent.create.mock.calls[0][0].data;
    expect(data.payload).toEqual({});
  });

  it('defaults objectType and objectId to null', async () => {
    const { ctx, db } = makeCtx({ kind: 'user', userId: 'u1' });

    await emitEvent(ctx as any, 'test.event', {});

    const data = db.platformEvent.create.mock.calls[0][0].data;
    expect(data.objectType).toBeNull();
    expect(data.objectId).toBeNull();
  });

  it('passes correlationId when provided', async () => {
    const { ctx, db } = makeCtx({ kind: 'user', userId: 'u1' });

    await emitEvent(ctx as any, 'test.event', { correlationId: 'corr_123' });

    const data = db.platformEvent.create.mock.calls[0][0].data;
    expect(data.correlationId).toBe('corr_123');
  });

  it('defaults correlationId to null', async () => {
    const { ctx, db } = makeCtx({ kind: 'user', userId: 'u1' });

    await emitEvent(ctx as any, 'test.event', {});

    const data = db.platformEvent.create.mock.calls[0][0].data;
    expect(data.correlationId).toBeNull();
  });
});
