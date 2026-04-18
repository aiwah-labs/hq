import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { sweepTempFiles } from '../sweep.js';
import type { StorageAdapter } from '@hq/storage';
import type { ServiceContext } from '@hq/services';

vi.mock('@hq/events', () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));

interface Folder {
  id: string;
  name: string;
  path: string;
  kind: 'USER' | 'SYSTEM' | 'TEMP';
  retentionDays: number | null;
}
interface FileRow {
  id: string;
  folderId: string;
  name: string;
  mime: string;
  size: number;
  storageKey: string;
  uploadStatus: 'PENDING' | 'COMPLETE';
  uploadedAt: Date | null;
}

const folders = new Map<string, Folder>();
const files = new Map<string, FileRow>();
let counter = 0;

function seedFolder(f: Omit<Folder, 'id'>): Folder {
  const id = `fld_${++counter}`;
  const folder = { id, ...f };
  folders.set(id, folder);
  return folder;
}
function seedFile(f: Omit<FileRow, 'id' | 'storageKey' | 'mime' | 'size' | 'name' | 'uploadStatus'> & Partial<FileRow>): FileRow {
  const id = `file_${++counter}`;
  const row: FileRow = {
    id,
    folderId: '',
    name: `f${counter}`,
    mime: 'application/octet-stream',
    size: 10,
    storageKey: `files/${id}`,
    uploadStatus: 'COMPLETE',
    uploadedAt: null,
    ...f,
  };
  files.set(id, row);
  return row;
}

const dbClient = {
  folder: {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; path?: string } }) => {
      if (where.id) return folders.get(where.id) ?? null;
      if (where.path) for (const f of folders.values()) if (f.path === where.path) return f;
      return null;
    }),
    findMany: vi.fn(async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, unknown> } = {}) => {
      const all = Array.from(folders.values()).filter((f) => {
        if (!where) return true;
        if (where.kind && f.kind !== where.kind) return false;
        if (where.retentionDays) {
          const cond = where.retentionDays as { not?: null };
          if (cond.not === null && f.retentionDays == null) return false;
        }
        if (where.path) {
          const sp = (where.path as { startsWith?: string }).startsWith;
          if (sp && !f.path.startsWith(sp)) return false;
        }
        return true;
      });
      if (select) return all;
      return all;
    }),
  },
  fileObject: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = files.get(where.id);
      return row ? { ...row } : null;
    }),
    findMany: vi.fn(async ({ where, select }: { where?: Record<string, unknown>; select?: unknown } = {}) => {
      void select;
      return Array.from(files.values()).filter((f) => {
        if (!where) return true;
        if (where.uploadStatus && f.uploadStatus !== where.uploadStatus) return false;
        if (where.folderId) {
          const fid = where.folderId as string | { in: string[] };
          if (typeof fid === 'string' && f.folderId !== fid) return false;
          if (typeof fid === 'object' && !fid.in.includes(f.folderId)) return false;
        }
        if (where.uploadedAt) {
          const cond = where.uploadedAt as { lt?: Date };
          if (cond.lt && (!f.uploadedAt || f.uploadedAt.getTime() >= cond.lt.getTime())) return false;
        }
        return true;
      });
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = files.get(where.id);
      if (!row) throw new Error('not found');
      files.delete(where.id);
      return row;
    }),
  },
};

const adapter: StorageAdapter = {
  driver: 'fake',
  supportsPresignedUrls: () => false,
  presignedPut: async () => { throw new Error('unsupported'); },
  presignedGet: async () => { throw new Error('unsupported'); },
  write: vi.fn(async () => {}),
  readBuffer: async () => Buffer.alloc(0),
  readStream: async () => Readable.from([]),
  delete: vi.fn(async () => {}),
  publicUrl: () => null,
};

function makeCtx(now = new Date('2026-04-18T10:00:00Z')): ServiceContext {
  return {
    actor: { kind: 'user', userId: 'u1' } as never,
    dbClient: dbClient as never,
    now: () => now,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

beforeEach(() => {
  folders.clear();
  files.clear();
  counter = 0;
  vi.clearAllMocks();
});

describe('sweepTempFiles', () => {
  it('deletes files older than retentionDays in TEMP folders', async () => {
    const temp = seedFolder({ name: 'imports', path: '/Temp/imports', kind: 'TEMP', retentionDays: 7 });
    seedFile({ folderId: temp.id, uploadedAt: new Date('2026-04-01T00:00:00Z') });
    seedFile({ folderId: temp.id, uploadedAt: new Date('2026-04-17T00:00:00Z') });

    const ctx = makeCtx();
    const result = await sweepTempFiles(ctx, adapter);

    expect(result.foldersScanned).toBe(1);
    expect(result.filesDeleted).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(files.size).toBe(1);
  });

  it('ignores folders without retentionDays', async () => {
    const temp = seedFolder({ name: 'orphans', path: '/Temp/orphans', kind: 'TEMP', retentionDays: null });
    seedFile({ folderId: temp.id, uploadedAt: new Date('2025-01-01T00:00:00Z') });

    const ctx = makeCtx();
    const result = await sweepTempFiles(ctx, adapter);

    expect(result.foldersScanned).toBe(0);
    expect(result.filesDeleted).toBe(0);
    expect(files.size).toBe(1);
  });

  it('ignores non-TEMP folders even if retentionDays is set', async () => {
    const user = seedFolder({ name: 'docs', path: '/Docs', kind: 'USER', retentionDays: 7 });
    seedFile({ folderId: user.id, uploadedAt: new Date('2026-01-01T00:00:00Z') });

    const ctx = makeCtx();
    const result = await sweepTempFiles(ctx, adapter);

    expect(result.foldersScanned).toBe(0);
    expect(result.filesDeleted).toBe(0);
  });

  it('sweeps descendant folders of a TEMP root', async () => {
    const root = seedFolder({ name: 'Temp', path: '/Temp', kind: 'TEMP', retentionDays: 3 });
    const child = seedFolder({ name: 'old', path: '/Temp/old', kind: 'TEMP', retentionDays: null });
    void root;
    seedFile({ folderId: child.id, uploadedAt: new Date('2026-04-01T00:00:00Z') });

    const ctx = makeCtx();
    const result = await sweepTempFiles(ctx, adapter);

    expect(result.filesDeleted).toBe(1);
    expect(files.size).toBe(0);
  });

  it('skips files whose uploadStatus is PENDING', async () => {
    const temp = seedFolder({ name: 'orphans', path: '/Temp/orphans', kind: 'TEMP', retentionDays: 1 });
    seedFile({ folderId: temp.id, uploadedAt: new Date('2026-01-01T00:00:00Z'), uploadStatus: 'PENDING' });

    const ctx = makeCtx();
    const result = await sweepTempFiles(ctx, adapter);

    expect(result.filesDeleted).toBe(0);
    expect(files.size).toBe(1);
  });
});
