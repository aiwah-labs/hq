import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('@hq/db', () => ({ db: {} }));

vi.mock('@hq/events', () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@hq/services', () => ({
  createServiceContext: vi.fn(),
}));

// Mock the registry with a test object
vi.mock('../registry.js', () => ({
  objects: {
    Widget: {
      model: 'Widget',
      scopes: { read: 'widget.read', write: 'widget.write', delete: 'widget.delete' },
      events: true,
      label: 'Widget',
      pluralLabel: 'Widgets',
      fields: {
        name: { type: 'string', required: true, label: 'Name', searchable: true, sortable: true },
        status: { type: 'enum', values: ['ACTIVE', 'ARCHIVED'], label: 'Status', filterable: true },
        category: { type: 'string', label: 'Category', filterable: true },
        notes: { type: 'text', label: 'Notes' },
        items: { type: 'relation', target: 'Item', kind: 'hasMany', label: 'Items' },
        owner: { type: 'relation', target: 'User', kind: 'belongsTo', foreignKey: 'ownerId', label: 'Owner' },
      },
    },
  },
}));

const { objectList, objectCount, objectGet, objectCreate, objectUpdate, objectDelete, objectBulkUpdate, objectBulkDelete } = await import('../crud.js');
const { emitEvent } = await import('@hq/events');

// ── Mock model ───────────────────────────────────────────────────────────────

const mockModel = {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
};

// Patch the db import to use our mock model
import { db } from '@hq/db';
(db as any).widget = mockModel;

const mockCtx = {
  actor: { kind: 'user', userId: 'u1' },
  dbClient: db,
  now: () => new Date(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── objectList ───────────────────────────────────────────────────────────────

describe('objectList', () => {
  it('returns items with pagination', async () => {
    const items = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
    mockModel.findMany.mockResolvedValue(items);

    const result = await objectList('Widget', {}, mockCtx);
    expect(result.items).toEqual(items);
    expect(result.nextCursor).toBeNull();
  });

  it('returns nextCursor when more items exist', async () => {
    // Default limit is 50, so return 51 items to trigger pagination
    const items = Array.from({ length: 51 }, (_, i) => ({ id: `${i}`, name: `Item ${i}` }));
    mockModel.findMany.mockResolvedValue(items);

    const result = await objectList('Widget', {}, mockCtx);
    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBe('49');
  });

  it('applies search query to searchable fields', async () => {
    mockModel.findMany.mockResolvedValue([]);
    await objectList('Widget', { q: 'test' }, mockCtx);

    const where = mockModel.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR.some((c: any) => 'name' in c)).toBe(true);
  });

  it('applies filters to filterable fields', async () => {
    mockModel.findMany.mockResolvedValue([]);
    await objectList('Widget', { filters: { status: 'ACTIVE' } }, mockCtx);

    const where = mockModel.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('ACTIVE');
  });

  it('ignores filters on non-filterable fields', async () => {
    mockModel.findMany.mockResolvedValue([]);
    await objectList('Widget', { filters: { name: 'test' } }, mockCtx);

    const where = mockModel.findMany.mock.calls[0][0].where;
    expect(where.name).toBeUndefined();
  });

  it('applies sort options', async () => {
    mockModel.findMany.mockResolvedValue([]);
    await objectList('Widget', { sortBy: 'name', sortDir: 'asc' }, mockCtx);

    const orderBy = mockModel.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ name: 'asc' });
  });

  it('uses cursor-based pagination', async () => {
    mockModel.findMany.mockResolvedValue([]);
    await objectList('Widget', { cursor: 'abc', limit: 10 }, mockCtx);

    const opts = mockModel.findMany.mock.calls[0][0];
    expect(opts.cursor).toEqual({ id: 'abc' });
    expect(opts.skip).toBe(1);
  });

  it('throws for unknown object', async () => {
    await expect(objectList('Nonexistent', {}, mockCtx)).rejects.toThrow('Unknown object');
  });

  it('includes _count for hasMany relations', async () => {
    mockModel.findMany.mockResolvedValue([]);
    await objectList('Widget', {}, mockCtx);

    const include = mockModel.findMany.mock.calls[0][0].include;
    expect(include._count.select.items).toBe(true);
  });

  it('includes belongsTo when requested', async () => {
    mockModel.findMany.mockResolvedValue([]);
    await objectList('Widget', { include: ['owner'] }, mockCtx);

    const include = mockModel.findMany.mock.calls[0][0].include;
    expect(include.owner).toBe(true);
  });
});

// ── objectCount ──────────────────────────────────────────────────────────────

describe('objectCount', () => {
  it('returns count with no filters', async () => {
    mockModel.count.mockResolvedValue(42);
    const result = await objectCount('Widget', {}, mockCtx);
    expect(result).toBe(42);
  });

  it('applies search query', async () => {
    mockModel.count.mockResolvedValue(5);
    await objectCount('Widget', { q: 'search' }, mockCtx);
    const where = mockModel.count.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
  });

  it('throws for unknown object', async () => {
    await expect(objectCount('Bad', {}, mockCtx)).rejects.toThrow('Unknown object');
  });
});

// ── objectGet ────────────────────────────────────────────────────────────────

describe('objectGet', () => {
  it('returns the record', async () => {
    const record = { id: 'w1', name: 'Widget' };
    mockModel.findUnique.mockResolvedValue(record);

    const result = await objectGet('Widget', 'w1', mockCtx);
    expect(result).toBe(record);
  });

  it('throws when not found', async () => {
    mockModel.findUnique.mockResolvedValue(null);
    await expect(objectGet('Widget', 'missing', mockCtx)).rejects.toThrow('not found');
  });

  it('includes relations in detail view', async () => {
    mockModel.findUnique.mockResolvedValue({ id: 'w1' });
    await objectGet('Widget', 'w1', mockCtx);

    const include = mockModel.findUnique.mock.calls[0][0].include;
    expect(include.items).toBeDefined(); // hasMany
    expect(include.owner).toBe(true); // belongsTo
  });
});

// ── objectCreate ─────────────────────────────────────────────────────────────

describe('objectCreate', () => {
  it('creates a record and emits event', async () => {
    const record = { id: 'w_new', name: 'New Widget' };
    mockModel.create.mockResolvedValue(record);

    const result = await objectCreate('Widget', { name: 'New Widget' }, mockCtx);
    expect(result).toBe(record);
    expect(emitEvent).toHaveBeenCalledWith(mockCtx, 'widget.created', expect.objectContaining({
      objectType: 'Widget',
      objectId: 'w_new',
    }));
  });
});

// ── objectUpdate ─────────────────────────────────────────────────────────────

describe('objectUpdate', () => {
  it('updates a record and emits event', async () => {
    const record = { id: 'w1', name: 'Updated' };
    mockModel.update.mockResolvedValue(record);

    const result = await objectUpdate('Widget', 'w1', { name: 'Updated' }, mockCtx);
    expect(result).toBe(record);
    expect(emitEvent).toHaveBeenCalledWith(mockCtx, 'widget.updated', expect.objectContaining({
      objectType: 'Widget',
      objectId: 'w1',
    }));
  });
});

// ── objectDelete ─────────────────────────────────────────────────────────────

describe('objectDelete', () => {
  it('deletes a record and emits event', async () => {
    mockModel.delete.mockResolvedValue({});

    await objectDelete('Widget', 'w1', mockCtx);
    expect(mockModel.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
    expect(emitEvent).toHaveBeenCalledWith(mockCtx, 'widget.deleted', expect.objectContaining({
      objectType: 'Widget',
      objectId: 'w1',
    }));
  });
});

// ── objectBulkUpdate ─────────────────────────────────────────────────────────

describe('objectBulkUpdate', () => {
  it('updates multiple records and returns results', async () => {
    mockModel.update.mockResolvedValue({});

    const results = await objectBulkUpdate('Widget', [
      { id: 'w1', name: 'A' },
      { id: 'w2', name: 'B' },
    ], mockCtx);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: 'w1', ok: true });
    expect(results[1]).toEqual({ id: 'w2', ok: true });
    expect(emitEvent).toHaveBeenCalledTimes(2);
  });

  it('catches per-item errors without aborting', async () => {
    mockModel.update.mockRejectedValueOnce(new Error('Not found')).mockResolvedValueOnce({});

    const results = await objectBulkUpdate('Widget', [
      { id: 'missing', name: 'A' },
      { id: 'w2', name: 'B' },
    ], mockCtx);

    expect(results[0]).toEqual({ id: 'missing', ok: false, error: 'Not found' });
    expect(results[1]).toEqual({ id: 'w2', ok: true });
  });
});

// ── objectBulkDelete ─────────────────────────────────────────────────────────

describe('objectBulkDelete', () => {
  it('deletes multiple records and returns count', async () => {
    mockModel.deleteMany.mockResolvedValue({ count: 3 });

    const result = await objectBulkDelete('Widget', ['w1', 'w2', 'w3'], mockCtx);
    expect(result).toEqual({ deleted: 3 });
    expect(emitEvent).toHaveBeenCalledWith(mockCtx, 'widget.bulk_deleted', expect.objectContaining({
      objectType: 'Widget',
      payload: { ids: ['w1', 'w2', 'w3'] },
    }));
  });
});

// ── Negative paths ───────────────────────────────────────────────────────────

describe('CRUD — error handling', () => {
  it('propagates create errors (e.g. unique constraint)', async () => {
    mockModel.create.mockRejectedValue(new Error('Unique constraint failed on the fields: (email)'));
    await expect(objectCreate('Widget', { name: 'dup' }, mockCtx)).rejects.toThrow('Unique constraint');
  });

  it('propagates update errors (record not found)', async () => {
    mockModel.update.mockRejectedValue(new Error('Record to update not found'));
    await expect(objectUpdate('Widget', 'missing', { name: 'X' }, mockCtx)).rejects.toThrow('Record to update not found');
  });

  it('propagates delete errors', async () => {
    mockModel.delete.mockRejectedValue(new Error('Record to delete does not exist'));
    await expect(objectDelete('Widget', 'ghost', mockCtx)).rejects.toThrow('does not exist');
  });

  it('does not emit event when create fails', async () => {
    mockModel.create.mockRejectedValue(new Error('DB error'));
    await expect(objectCreate('Widget', { name: 'X' }, mockCtx)).rejects.toThrow();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('does not emit event when update fails', async () => {
    mockModel.update.mockRejectedValue(new Error('DB error'));
    await expect(objectUpdate('Widget', 'w1', { name: 'X' }, mockCtx)).rejects.toThrow();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('does not emit event when delete fails', async () => {
    mockModel.delete.mockRejectedValue(new Error('DB error'));
    await expect(objectDelete('Widget', 'w1', mockCtx)).rejects.toThrow();
    expect(emitEvent).not.toHaveBeenCalled();
  });
});

// ── Event emission failure isolation ─────────────────────────────────────────

describe('CRUD — emitEvent failure does not roll back write', () => {
  it('create succeeds even if emitEvent throws', async () => {
    const record = { id: 'w_ok', name: 'Created' };
    mockModel.create.mockResolvedValue(record);
    vi.mocked(emitEvent).mockRejectedValueOnce(new Error('event bus down'));

    // emitEvent failure propagates — this is current behavior
    // The write has already succeeded in the DB at this point
    await expect(objectCreate('Widget', { name: 'Created' }, mockCtx)).rejects.toThrow('event bus down');

    // But the DB write DID happen
    expect(mockModel.create).toHaveBeenCalledOnce();
  });
});
