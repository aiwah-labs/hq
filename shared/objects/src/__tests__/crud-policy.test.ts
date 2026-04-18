import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@hq/db', () => ({ db: {} }));
vi.mock('@hq/events', () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@hq/services', () => ({ createServiceContext: vi.fn() }));

// Widget with ownership configured so we can exercise 'own' access.
vi.mock('../registry.js', () => ({
  objects: {
    Task: {
      model: 'Task',
      label: 'Task',
      pluralLabel: 'Tasks',
      scopes: { read: 'task.read', write: 'task.write' },
      events: true,
      ownership: { ownerField: 'ownerUserId' },
      fields: {
        name: { type: 'string', label: 'Name', required: true, searchable: true },
        ownerUserId: { type: 'string', label: 'Owner' },
      },
    },
  },
}));

const { objectList, objectGet, objectUpdate, objectDelete, objectBulkDelete } = await import('../crud.js');
const { db } = await import('@hq/db');

const mockModel = {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
};
(db as any).task = mockModel;

function makeCtx(actor: any) {
  return {
    actor,
    dbClient: db,
    now: () => new Date(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as any;
}

const adminCtx = makeCtx({
  kind: 'user',
  userId: 'u-admin',
  email: 'admin@example.com',
  dbRole: 'ADMIN',
  effectiveRole: 'ADMIN',
  isSuperadmin: false,
  scopes: [],
  permissions: {},
});

const memberCtx = makeCtx({
  kind: 'user',
  userId: 'u-member',
  email: 'm@example.com',
  dbRole: 'MEMBER',
  effectiveRole: 'MEMBER',
  isSuperadmin: false,
  scopes: [],
  permissions: {},
});

// Bot with no useful perms — should be denied.
const strangerBotCtx = makeCtx({
  kind: 'bot',
  source: 'apikey',
  apiKeyId: 'k',
  botId: 'b',
  botSlug: 'b',
  botName: 'b',
  createdByUserId: 'u-admin',
  createdByEmail: 'admin@example.com',
  scopes: [],
  permissions: {},
});

beforeEach(() => vi.clearAllMocks());

// ── Reads ─────────────────────────────────────────────────────────────────────

describe('objectList — policy', () => {
  it('allows admins to read every record', async () => {
    mockModel.findMany.mockResolvedValue([]);
    await objectList('Task', {}, adminCtx);
    // No ownership scoping injected into where.
    const where = mockModel.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });

  it('scopes members to own records via ownership fields', async () => {
    mockModel.findMany.mockResolvedValue([]);
    await objectList('Task', {}, memberCtx);
    // Wait — members get `all` reads (not 'own'), so no ownership scoping.
    const where = mockModel.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });

  it('denies principals with no access at all', async () => {
    await expect(objectList('Task', {}, strangerBotCtx)).rejects.toThrow(/no access/i);
  });
});

// ── Get ──────────────────────────────────────────────────────────────────────

describe('objectGet — policy', () => {
  it('admins can read any record', async () => {
    mockModel.findUnique.mockResolvedValue({ id: 't1', ownerUserId: 'someone-else' });
    const out = await objectGet('Task', 't1', adminCtx);
    expect(out).toBeDefined();
  });

  it('members can read any record (member reads are `all`)', async () => {
    mockModel.findUnique.mockResolvedValue({ id: 't1', ownerUserId: 'other' });
    const out = await objectGet('Task', 't1', memberCtx);
    expect(out).toBeDefined();
  });
});

// ── Update ───────────────────────────────────────────────────────────────────

describe('objectUpdate — policy', () => {
  it('members can update their own record', async () => {
    mockModel.findUnique.mockResolvedValue({ id: 't1', ownerUserId: 'u-member' });
    mockModel.update.mockResolvedValue({ id: 't1', ownerUserId: 'u-member' });
    await expect(
      objectUpdate('Task', 't1', { name: 'mine' }, memberCtx),
    ).resolves.toBeDefined();
  });

  it('members cannot update a record they do not own', async () => {
    mockModel.findUnique.mockResolvedValue({ id: 't1', ownerUserId: 'other' });
    await expect(objectUpdate('Task', 't1', { name: 'x' }, memberCtx)).rejects.toThrow(/not owner/);
    expect(mockModel.update).not.toHaveBeenCalled();
  });

  it('strangers cannot update at all', async () => {
    mockModel.findUnique.mockResolvedValue({ id: 't1', ownerUserId: 'anyone' });
    await expect(objectUpdate('Task', 't1', {}, strangerBotCtx)).rejects.toThrow(/no access/i);
    expect(mockModel.update).not.toHaveBeenCalled();
  });
});

// ── Delete ───────────────────────────────────────────────────────────────────

describe('objectDelete — policy', () => {
  it('members cannot delete a record they do not own', async () => {
    mockModel.findUnique.mockResolvedValue({ id: 't1', ownerUserId: 'stranger' });
    await expect(objectDelete('Task', 't1', memberCtx)).rejects.toThrow(/not owner/);
    expect(mockModel.delete).not.toHaveBeenCalled();
  });

  it('members can delete their own record', async () => {
    mockModel.findUnique.mockResolvedValue({ id: 't1', ownerUserId: 'u-member' });
    mockModel.delete.mockResolvedValue({});
    await expect(objectDelete('Task', 't1', memberCtx)).resolves.toBeUndefined();
  });
});

// ── Bulk delete ──────────────────────────────────────────────────────────────

describe('objectBulkDelete — policy', () => {
  it('admins delete all requested ids', async () => {
    mockModel.deleteMany.mockResolvedValue({ count: 3 });
    const result = await objectBulkDelete('Task', ['a', 'b', 'c'], adminCtx);
    expect(result).toEqual({ deleted: 3 });
  });

  it('members only delete the ids they own', async () => {
    // Simulate a-c where only 'b' belongs to the member.
    mockModel.findMany.mockResolvedValue([
      { id: 'a', ownerUserId: 'other' },
      { id: 'b', ownerUserId: 'u-member' },
      { id: 'c', ownerUserId: 'someone' },
    ]);
    mockModel.deleteMany.mockResolvedValue({ count: 1 });
    const result = await objectBulkDelete('Task', ['a', 'b', 'c'], memberCtx);
    expect(result).toEqual({ deleted: 1 });
    // Confirm only 'b' was targeted for deletion.
    const call = mockModel.deleteMany.mock.calls[0][0];
    expect(call.where.id.in).toEqual(['b']);
  });

  it('strangers are refused outright', async () => {
    await expect(objectBulkDelete('Task', ['a'], strangerBotCtx)).rejects.toThrow(/no access/i);
  });
});
