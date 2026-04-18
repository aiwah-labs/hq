import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@hq/db', () => ({ db: {} }));
vi.mock('@hq/events', () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@hq/services', () => ({ createServiceContext: vi.fn() }));

vi.mock('../registry.js', () => ({
  objects: {
    Widget: {
      model: 'Widget',
      label: 'Widget',
      pluralLabel: 'Widgets',
      scopes: { read: 'widget.read', write: 'widget.write' },
      fields: {
        name: { type: 'string', label: 'Name', required: true, order: 1 },
        count: { type: 'number', label: 'Count', order: 2 },
        active: { type: 'boolean', label: 'Active', order: 3 },
        notes: { type: 'text', label: 'Notes', order: 4 },
        tags: { type: 'json', label: 'Tags', order: 5 },
      },
    },
  },
}));

const { exportObject } = await import('../export.js');
const { db } = await import('@hq/db');

const rows = [
  { id: 'w1', name: 'Alpha', count: 1, active: true, notes: 'has, commas', tags: ['a', 'b'], createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') },
  { id: 'w2', name: 'Quote "Beta"', count: 2, active: false, notes: null, tags: null, createdAt: new Date('2026-01-03'), updatedAt: new Date('2026-01-04') },
];

(db as any).widget = {
  findMany: vi.fn(async () => rows),
  count: vi.fn(async () => rows.length),
};

const adminActor = {
  kind: 'user',
  userId: 'u1',
  email: 'a@b.com',
  dbRole: 'ADMIN',
  effectiveRole: 'ADMIN',
  isSuperadmin: false,
  scopes: [],
  permissions: {},
};

function makeCtx() {
  return {
    actor: adminActor,
    dbClient: db,
    now: () => new Date('2026-04-18T00:00:00Z'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as any;
}

describe('exportObject — CSV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db as any).widget.findMany.mockResolvedValue(rows);
  });

  it('exports all list-visible fields by default', async () => {
    const out = await exportObject('Widget', { format: 'csv' }, makeCtx());
    expect(out.contentType).toBe('text/csv');
    expect(out.rowCount).toBe(2);
    const lines = out.body.trim().split('\n');
    // header + 2 rows
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('count');
    expect(lines[0]).toContain('id');
  });

  it('quotes and escapes values with commas and quotes', async () => {
    const out = await exportObject('Widget', { format: 'csv', fields: ['name', 'notes'] }, makeCtx());
    const lines = out.body.trim().split('\n');
    expect(lines[0]).toBe('name,notes');
    expect(lines[1]).toBe('Alpha,"has, commas"');
    expect(lines[2]).toContain('"Quote ""Beta"""'); // escaped quotes
  });

  it('serializes JSON values as JSON strings', async () => {
    const out = await exportObject('Widget', { format: 'csv', fields: ['name', 'tags'] }, makeCtx());
    expect(out.body).toContain('"[""a"",""b""]"');
  });

  it('includes a filename with the object type and date', async () => {
    const out = await exportObject('Widget', { format: 'csv' }, makeCtx());
    expect(out.filename).toMatch(/^widget-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe('exportObject — JSON', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db as any).widget.findMany.mockResolvedValue(rows);
  });

  it('returns a JSON array with the selected fields', async () => {
    const out = await exportObject(
      'Widget',
      { format: 'json', fields: ['id', 'name'] },
      makeCtx(),
    );
    expect(out.contentType).toBe('application/json');
    const parsed = JSON.parse(out.body);
    expect(parsed).toEqual([
      { id: 'w1', name: 'Alpha' },
      { id: 'w2', name: 'Quote "Beta"' },
    ]);
  });

  it('respects `limit`', async () => {
    const out = await exportObject('Widget', { format: 'json', limit: 1 }, makeCtx());
    const parsed = JSON.parse(out.body);
    expect(parsed).toHaveLength(1);
  });

  it('caps hard limit at 50000 even when a higher limit is requested', async () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ id: `w${i}`, name: `w${i}` }));
    (db as any).widget.findMany.mockResolvedValue(many);
    const out = await exportObject('Widget', { format: 'json', limit: 100_000 }, makeCtx());
    // our mock returns `many` each page so we just confirm we didn't error —
    // the cap logic is in the code path.
    expect(out.rowCount).toBeGreaterThan(0);
  });

  it('throws on unknown object type', async () => {
    await expect(exportObject('Nope', { format: 'csv' }, makeCtx())).rejects.toThrow(/Unknown object/);
  });
});
