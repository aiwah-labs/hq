import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFolder,
  ensureFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  listFolders,
  getFolderByPath,
} from '../folders.js';
import type { ServiceContext } from '@hq/services';

vi.mock('@hq/events', () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));

// ── In-memory folder store with minimal Prisma-compatible surface ───────────

interface FolderRow {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  kind: 'USER' | 'SYSTEM' | 'TEMP';
  retentionDays: number | null;
  indexConfig: unknown;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let idCounter = 0;
const folders = new Map<string, FolderRow>();

function matchesPrefix(path: string, where: Record<string, unknown>): boolean {
  if (!where || !where.path) return true;
  const p = where.path as Record<string, string> | string;
  if (typeof p === 'string') return path === p;
  if (p.startsWith) return path.startsWith(p.startsWith);
  return true;
}

const folderApi = {
  findUnique: vi.fn(async ({ where }: { where: { id?: string; path?: string } }) => {
    if (where.id) return folders.get(where.id) ?? null;
    if (where.path) {
      for (const f of folders.values()) if (f.path === where.path) return f;
      return null;
    }
    return null;
  }),
  findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
    return Array.from(folders.values()).filter((f) => {
      if (!where) return true;
      if (where.parentId !== undefined && f.parentId !== where.parentId) return false;
      if (where.kind && f.kind !== where.kind) return false;
      if (where.path && !matchesPrefix(f.path, where)) return false;
      return true;
    });
  }),
  create: vi.fn(async ({ data }: { data: Omit<FolderRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
    const row: FolderRow = {
      id: `fld_${++idCounter}`,
      createdAt: new Date('2026-04-18'),
      updatedAt: new Date('2026-04-18'),
      indexConfig: null,
      ...data,
    } as FolderRow;
    folders.set(row.id, row);
    return row;
  }),
  update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FolderRow> }) => {
    const row = folders.get(where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, data, { updatedAt: new Date() });
    return row;
  }),
  delete: vi.fn(async ({ where }: { where: { id: string } }) => {
    const row = folders.get(where.id);
    if (!row) throw new Error('not found');
    // Cascade children (mimic Prisma `onDelete: Cascade`)
    for (const child of Array.from(folders.values())) {
      if (child.path.startsWith(`${row.path}/`)) folders.delete(child.id);
    }
    folders.delete(where.id);
    return row;
  }),
};

const dbClient = {
  folder: folderApi,
  $transaction: async (fn: (tx: typeof dbClient) => Promise<unknown>) => fn(dbClient as never),
};

function makeCtx(): ServiceContext {
  return {
    actor: { kind: 'user', userId: 'u1' } as never,
    dbClient: dbClient as never,
    now: () => new Date('2026-04-18'),
    logger: console,
  };
}

beforeEach(() => {
  folders.clear();
  idCounter = 0;
  vi.clearAllMocks();
});

describe('createFolder', () => {
  it('creates a root-level folder with a leading-slash path', async () => {
    const ctx = makeCtx();
    const folder = await createFolder(ctx, { name: 'Projects' });
    expect(folder.path).toBe('/Projects');
    expect(folder.parentId).toBeNull();
    expect(folder.kind).toBe('USER');
  });

  it('nests path under parent', async () => {
    const ctx = makeCtx();
    const parent = await createFolder(ctx, { name: 'Products' });
    const child = await createFolder(ctx, { name: 'Acme', parentId: parent.id });
    expect(child.path).toBe('/Products/Acme');
  });

  it('rejects empty or "/"-containing names', async () => {
    const ctx = makeCtx();
    await expect(createFolder(ctx, { name: '' })).rejects.toThrow('empty');
    await expect(createFolder(ctx, { name: 'has/slash' })).rejects.toThrow('cannot contain');
  });

  it('rejects when parent is missing', async () => {
    const ctx = makeCtx();
    await expect(createFolder(ctx, { name: 'x', parentId: 'missing' })).rejects.toThrow('not found');
  });

  it('records the creating user on USER principals', async () => {
    const ctx = makeCtx();
    const f = await createFolder(ctx, { name: 'Mine' });
    expect(f.createdByUserId).toBe('u1');
  });
});

describe('ensureFolder', () => {
  it('creates intermediate folders and returns the leaf', async () => {
    const ctx = makeCtx();
    const leaf = await ensureFolder(ctx, '/System/Imports');
    expect(leaf.path).toBe('/System/Imports');
    expect(await getFolderByPath(ctx, '/System')).not.toBeNull();
    expect(await getFolderByPath(ctx, '/System/Imports')).not.toBeNull();
  });

  it('is idempotent — second call returns the same leaf', async () => {
    const ctx = makeCtx();
    const a = await ensureFolder(ctx, '/Docs/Contracts');
    const b = await ensureFolder(ctx, '/Docs/Contracts');
    expect(b.id).toBe(a.id);
  });

  it('only applies the requested kind to the leaf', async () => {
    const ctx = makeCtx();
    const leaf = await ensureFolder(ctx, '/Temp/Runs', 'TEMP');
    expect(leaf.kind).toBe('TEMP');
    const parent = await getFolderByPath(ctx, '/Temp');
    expect(parent?.kind).toBe('USER');
  });
});

describe('renameFolder', () => {
  it('updates the folder path and rewrites descendants', async () => {
    const ctx = makeCtx();
    const a = await createFolder(ctx, { name: 'Old' });
    await createFolder(ctx, { name: 'Child', parentId: a.id });
    await createFolder(ctx, { name: 'Grand', parentId: (await getFolderByPath(ctx, '/Old/Child'))!.id });

    await renameFolder(ctx, a.id, 'New');

    expect((await getFolderByPath(ctx, '/New'))?.id).toBe(a.id);
    expect(await getFolderByPath(ctx, '/New/Child')).not.toBeNull();
    expect(await getFolderByPath(ctx, '/New/Child/Grand')).not.toBeNull();
    expect(await getFolderByPath(ctx, '/Old')).toBeNull();
  });

  it('refuses to rename SYSTEM folders', async () => {
    const ctx = makeCtx();
    const sys = await createFolder(ctx, { name: 'System', kind: 'SYSTEM' });
    await expect(renameFolder(ctx, sys.id, 'x')).rejects.toThrow('System folders');
  });
});

describe('moveFolder', () => {
  it('rewrites path when moved under a new parent', async () => {
    const ctx = makeCtx();
    await createFolder(ctx, { name: 'A' });
    await createFolder(ctx, { name: 'B' });
    const a = (await getFolderByPath(ctx, '/A'))!;
    const b = (await getFolderByPath(ctx, '/B'))!;
    const moved = await moveFolder(ctx, b.id, a.id);
    expect(moved.path).toBe('/A/B');
  });

  it('refuses to move a folder into its own descendant', async () => {
    const ctx = makeCtx();
    const a = await createFolder(ctx, { name: 'A' });
    const child = await createFolder(ctx, { name: 'Child', parentId: a.id });
    await expect(moveFolder(ctx, a.id, child.id)).rejects.toThrow('into itself');
  });
});

describe('deleteFolder', () => {
  it('refuses to delete SYSTEM folders', async () => {
    const ctx = makeCtx();
    const sys = await createFolder(ctx, { name: 'Sys', kind: 'SYSTEM' });
    await expect(deleteFolder(ctx, sys.id)).rejects.toThrow('System folders');
  });

  it('emits folder.deleted', async () => {
    const ctx = makeCtx();
    const { emitEvent } = await import('@hq/events');
    const f = await createFolder(ctx, { name: 'Scratch' });
    await deleteFolder(ctx, f.id);
    expect(emitEvent).toHaveBeenCalledWith(ctx, 'folder.deleted', expect.objectContaining({
      objectId: f.id,
    }));
  });
});

describe('listFolders', () => {
  it('filters by parentId and kind', async () => {
    const ctx = makeCtx();
    const parent = await createFolder(ctx, { name: 'Root' });
    await createFolder(ctx, { name: 'A', parentId: parent.id });
    await createFolder(ctx, { name: 'Temp', parentId: parent.id, kind: 'TEMP' });

    const all = await listFolders(ctx, { parentId: parent.id });
    expect(all).toHaveLength(2);

    const temps = await listFolders(ctx, { parentId: parent.id, kind: 'TEMP' });
    expect(temps).toHaveLength(1);
  });
});
