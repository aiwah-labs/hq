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
        name: { type: 'string', label: 'Name', required: true },
        count: { type: 'number', label: 'Count' },
        active: { type: 'boolean', label: 'Active' },
        status: { type: 'enum', label: 'Status', values: ['ON', 'OFF'] },
        due: { type: 'date', label: 'Due' },
        meta: { type: 'json', label: 'Meta' },
        computed: { type: 'string', label: 'Computed', readonly: true },
      },
    },
  },
}));

const {
  parseImportContent,
  validateImportRows,
  parseCsv,
  previewImport,
  executeImport,
} = await import('../import.js');
const { db } = await import('@hq/db');

(db as any).widget = {
  create: vi.fn(async ({ data }: any) => ({ id: `new_${Math.random()}`, ...data })),
};

const adminActor = {
  kind: 'user' as const,
  source: 'session' as const,
  userId: 'u1',
  email: 'a@b.com',
  dbRole: 'ADMIN' as const,
  effectiveRole: 'ADMIN' as const,
  isSuperadmin: false,
  scopes: [],
  permissions: {},
};

function makeCtx(actor: any = adminActor) {
  return {
    actor,
    dbClient: db,
    now: () => new Date('2026-04-18T00:00:00Z'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as any;
}

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n4,5,6\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quoted fields with commas and newlines', () => {
    expect(parseCsv('a,b\n"has, comma","line\nbreak"\n')).toEqual([
      ['a', 'b'],
      ['has, comma', 'line\nbreak'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"hello ""world"""\n')).toEqual([['a'], ['hello "world"']]);
  });

  it('throws on unbalanced quotes', () => {
    expect(() => parseCsv('a\n"unclosed')).toThrow(/Unbalanced/);
  });
});

describe('parseImportContent', () => {
  it('parses JSON arrays of objects', () => {
    const { rows, sourceFields } = parseImportContent({
      format: 'json',
      content: JSON.stringify([
        { name: 'A', count: 1 },
        { name: 'B', count: 2 },
      ]),
    });
    expect(rows).toHaveLength(2);
    expect(sourceFields.sort()).toEqual(['count', 'name']);
  });

  it('rejects non-array JSON', () => {
    expect(() =>
      parseImportContent({ format: 'json', content: '{"name":"A"}' }),
    ).toThrow(/array/);
  });

  it('parses CSV headers + rows', () => {
    const { rows, sourceFields } = parseImportContent({
      format: 'csv',
      content: 'name,count\nA,1\nB,2\n',
    });
    expect(sourceFields).toEqual(['name', 'count']);
    expect(rows).toEqual([
      { name: 'A', count: '1' },
      { name: 'B', count: '2' },
    ]);
  });
});

describe('validateImportRows — coercion', () => {
  it('coerces number/boolean/date/enum/json from strings', () => {
    const { rows } = validateImportRows('Widget', [
      {
        name: 'A',
        count: '42',
        active: 'true',
        status: 'ON',
        due: '2026-05-01',
        meta: '{"k":1}',
      },
    ]);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].data).toMatchObject({
      name: 'A',
      count: 42,
      active: true,
      status: 'ON',
      meta: { k: 1 },
    });
    expect(rows[0].data.due).toBeInstanceOf(Date);
  });

  it('flags invalid enum values', () => {
    const { rows, errorCount } = validateImportRows('Widget', [
      { name: 'A', status: 'NOT_A_VALUE' },
    ]);
    expect(errorCount).toBe(1);
    expect(rows[0].errors[0].field).toBe('status');
    expect(rows[0].errors[0].message).toMatch(/ON, OFF/);
  });

  it('flags invalid numbers and dates', () => {
    const { rows } = validateImportRows('Widget', [
      { name: 'A', count: 'not-a-number', due: 'whenever' },
    ]);
    const messages = rows[0].errors.map((e) => `${e.field}:${e.message}`);
    expect(messages.some((m) => m.startsWith('count:'))).toBe(true);
    expect(messages.some((m) => m.startsWith('due:'))).toBe(true);
  });

  it('flags required field missing', () => {
    const { rows } = validateImportRows('Widget', [{ count: 1 }]);
    expect(rows[0].errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('skips readonly fields and warns on unknown keys', () => {
    const { rows } = validateImportRows('Widget', [
      { name: 'A', computed: 'nope', weird: 'x' },
    ]);
    // computed is skipped (readonly) so no "computed" in data;
    // `weird` generates an "Unknown field" error.
    expect(rows[0].data.computed).toBeUndefined();
    expect(rows[0].errors.some((e) => e.field === 'weird')).toBe(true);
  });

  it('coerces yes/no/1/0 to booleans', () => {
    const { rows } = validateImportRows('Widget', [
      { name: 'A', active: 'yes' },
      { name: 'B', active: '0' },
      { name: 'C', active: 'maybe' },
    ]);
    expect(rows[0].data.active).toBe(true);
    expect(rows[1].data.active).toBe(false);
    expect(rows[2].errors.some((e) => e.field === 'active')).toBe(true);
  });
});

describe('previewImport', () => {
  it('returns sample rows, total count, error count, and fieldMap', async () => {
    const csv = 'name,count\nA,1\nB,bad\nC,3\n';
    const preview = await previewImport(
      'Widget',
      { format: 'csv', content: csv },
      makeCtx(),
    );
    expect(preview.totalRows).toBe(3);
    expect(preview.errorCount).toBe(1);
    expect(preview.fieldMap).toEqual({ name: 'name', count: 'count' });
    expect(preview.sampleRows).toHaveLength(3);
  });

  it('collects fileErrors on malformed payloads instead of throwing', async () => {
    const preview = await previewImport(
      'Widget',
      { format: 'json', content: 'not json' },
      makeCtx(),
    );
    expect(preview.fileErrors.length).toBeGreaterThan(0);
    expect(preview.sampleRows).toEqual([]);
  });

  it('denies previews for agents without the bulk scope', async () => {
    const agentActor = {
      kind: 'agent' as const,
      source: 'internal' as const,
      agentKey: 'k',
      agentName: 'A',
      scopes: [],
      permissions: {},
    };
    await expect(
      previewImport(
        'Widget',
        { format: 'csv', content: 'name\nA\n' },
        makeCtx(agentActor),
      ),
    ).rejects.toThrow();
  });
});

describe('executeImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db as any).widget.create = vi.fn(async ({ data }: any) => ({ id: 'new', ...data }));
  });

  it('writes error-free rows and skips rows with errors', async () => {
    const csv = 'name,count\nA,1\n,oops\nC,3\n';
    const result = await executeImport(
      'Widget',
      { format: 'csv', content: csv },
      makeCtx(),
    );
    expect(result.created).toBe(2);
    expect(result.failed).toBe(1);
    expect((db as any).widget.create).toHaveBeenCalledTimes(2);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('records per-row create failures', async () => {
    (db as any).widget.create = vi.fn(async () => {
      throw new Error('duplicate key');
    });
    const result = await executeImport(
      'Widget',
      { format: 'csv', content: 'name\nA\n' },
      makeCtx(),
    );
    expect(result.created).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toMatch(/duplicate/);
  });
});
