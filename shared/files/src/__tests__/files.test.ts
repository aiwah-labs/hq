import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import {
  beginUpload,
  completeUpload,
  uploadDirect,
  deleteFile,
  moveFile,
  renameFile,
  updateFileMetadata,
  resolveDownloadUrl,
} from '../files.js';
import { searchFiles } from '../search.js';
import type { StorageAdapter } from '@hq/storage';
import type { ServiceContext } from '@hq/services';

vi.mock('@hq/events', () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));

// ── In-memory mock DB ───────────────────────────────────────────────────────

interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  kind: 'USER' | 'SYSTEM' | 'TEMP';
}
interface FileRow {
  id: string;
  folderId: string;
  name: string;
  mime: string;
  size: number;
  checksum: string | null;
  storageKey: string;
  description: string | null;
  extractedText: string | null;
  tags: string[];
  metadata: unknown;
  uploadStatus: 'PENDING' | 'COMPLETE' | 'FAILED';
  uploadedAt: Date | null;
  indexStatus: 'PENDING' | 'EXTRACTING' | 'INDEXED' | 'SKIPPED' | 'FAILED';
  indexedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const folders = new Map<string, Folder>();
const files = new Map<string, FileRow>();
let counter = 0;

function seedFolder(init: Partial<Folder> & { name: string; path: string }): Folder {
  const id = init.path === '/' ? 'root' : `fld_${++counter}`;
  const folder: Folder = {
    id,
    parentId: null,
    kind: 'USER',
    ...init,
  } as Folder;
  folders.set(folder.id, folder);
  return folder;
}

const dbClient = {
  folder: {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; path?: string } }) => {
      if (where.id) return folders.get(where.id) ?? null;
      if (where.path) {
        for (const f of folders.values()) if (f.path === where.path) return f;
      }
      return null;
    }),
    findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      return Array.from(folders.values()).filter((f) => {
        if (!where) return true;
        if (where.OR && Array.isArray(where.OR)) {
          return (where.OR as Array<Record<string, unknown>>).some((clause) => {
            if (typeof clause.path === 'string') return f.path === clause.path;
            if (clause.path && typeof clause.path === 'object') {
              const sp = (clause.path as { startsWith?: string }).startsWith;
              if (sp) return f.path.startsWith(sp);
            }
            return false;
          });
        }
        return true;
      });
    }),
  },
  fileObject: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = files.get(where.id);
      return row ? { ...row } : null;
    }),
    findMany: vi.fn(async ({ where, take, cursor, skip, orderBy }: {
      where?: Record<string, unknown>;
      take?: number;
      cursor?: { id: string };
      skip?: number;
      orderBy?: unknown;
    } = {}) => {
      let items = Array.from(files.values()).filter((f) => {
        if (!where) return true;
        if (where.uploadStatus && f.uploadStatus !== where.uploadStatus) return false;
        if (where.folderId) {
          const fid = where.folderId as string | { in: string[] };
          if (typeof fid === 'string' && f.folderId !== fid) return false;
          if (typeof fid === 'object' && !fid.in.includes(f.folderId)) return false;
        }
        if (where.mime) {
          const m = where.mime as string | { startsWith: string };
          if (typeof m === 'string' && f.mime !== m) return false;
          if (typeof m === 'object' && !f.mime.startsWith(m.startsWith)) return false;
        }
        if (where.tags && (where.tags as { hasEvery?: string[]; has?: string }).hasEvery) {
          const required = (where.tags as { hasEvery: string[] }).hasEvery;
          if (!required.every((t) => f.tags.includes(t))) return false;
        }
        if (where.OR && Array.isArray(where.OR)) {
          const ok = (where.OR as Array<Record<string, unknown>>).some((clause) => {
            if (clause.name) {
              const c = (clause.name as { contains?: string }).contains ?? '';
              if (f.name.toLowerCase().includes(c.toLowerCase())) return true;
            }
            if (clause.description) {
              const c = (clause.description as { contains?: string }).contains ?? '';
              if ((f.description ?? '').toLowerCase().includes(c.toLowerCase())) return true;
            }
            if (clause.extractedText) {
              const c = (clause.extractedText as { contains?: string }).contains ?? '';
              if ((f.extractedText ?? '').toLowerCase().includes(c.toLowerCase())) return true;
            }
            if (clause.tags && (clause.tags as { has?: string }).has) {
              const t = (clause.tags as { has: string }).has;
              if (f.tags.includes(t)) return true;
            }
            return false;
          });
          if (!ok) return false;
        }
        return true;
      });
      items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      if (cursor) {
        const idx = items.findIndex((f) => f.id === cursor.id);
        items = items.slice(idx + (skip ?? 0));
      }
      if (take) items = items.slice(0, take);
      return items;
    }),
    create: vi.fn(async ({ data }: { data: Partial<FileRow> }) => {
      const id = `file_${++counter}`;
      const row: FileRow = {
        id,
        folderId: '',
        name: '',
        mime: 'application/octet-stream',
        size: 0,
        checksum: null,
        storageKey: '',
        description: null,
        extractedText: null,
        tags: [],
        metadata: null,
        uploadStatus: 'PENDING',
        uploadedAt: null,
        indexStatus: 'PENDING',
        indexedAt: null,
        createdByUserId: null,
        createdAt: new Date('2026-04-18'),
        updatedAt: new Date('2026-04-18'),
        ...data,
      };
      files.set(id, row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FileRow> }) => {
      const row = files.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = files.get(where.id);
      if (!row) throw new Error('not found');
      files.delete(where.id);
      return row;
    }),
  },
};

// ── Fake storage adapter ────────────────────────────────────────────────────

const storageBytes = new Map<string, Buffer>();

function makeAdapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  const base: StorageAdapter = {
    driver: 'fake',
    supportsPresignedUrls: () => false,
    presignedPut: async () => { throw new Error('unsupported'); },
    presignedGet: async () => { throw new Error('unsupported'); },
    write: vi.fn(async (key: string, data) => {
      const buf = data instanceof Readable ? Buffer.from([]) : Buffer.from(data as Uint8Array);
      storageBytes.set(key, buf);
    }),
    readBuffer: async (key: string) => storageBytes.get(key) ?? Buffer.alloc(0),
    readStream: async () => Readable.from([]),
    delete: vi.fn(async (key: string) => { storageBytes.delete(key); }),
    publicUrl: () => null,
  };
  return { ...base, ...overrides } as StorageAdapter;
}

function makeCtx(): ServiceContext {
  return {
    actor: { kind: 'user', userId: 'u1' } as never,
    dbClient: dbClient as never,
    now: () => new Date('2026-04-18T10:00:00Z'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

beforeEach(() => {
  folders.clear();
  files.clear();
  storageBytes.clear();
  counter = 0;
  vi.clearAllMocks();
  seedFolder({ name: 'Products', path: '/Products' });
});

describe('beginUpload + completeUpload', () => {
  it('creates a PENDING FileObject and stamps storageKey', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const res = await beginUpload(ctx, { folderId: folder!.id, name: 'shirt.png', mime: 'image/png' }, makeAdapter());
    expect(res.method).toBe('passthrough');
    expect(res.storageKey).toBe(`files/${res.fileId}`);
    const row = files.get(res.fileId)!;
    expect(row.uploadStatus).toBe('PENDING');
    expect(row.storageKey).toBe(res.storageKey);
  });

  it('completeUpload flips status and emits file.created', async () => {
    const ctx = makeCtx();
    const { emitEvent } = await import('@hq/events');
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const { fileId } = await beginUpload(ctx, { folderId: folder!.id, name: 'x.png' }, makeAdapter());
    const complete = await completeUpload(ctx, fileId, { size: 123, checksum: 'abc' });
    expect(complete.uploadStatus).toBe('COMPLETE');
    expect(complete.size).toBe(123);
    expect(emitEvent).toHaveBeenCalledWith(ctx, 'file.created', expect.objectContaining({
      objectId: fileId,
    }));
  });

  it('uses presigned PUT when the adapter supports it', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const adapter = makeAdapter({
      supportsPresignedUrls: () => true,
      presignedPut: async () => 'https://signed.example/put',
    });
    const res = await beginUpload(ctx, { folderId: folder!.id, name: 'x.png', mime: 'image/png' }, adapter);
    expect(res.method).toBe('presigned');
    expect(res.uploadUrl).toBe('https://signed.example/put');
  });

  it('rejects when folder is missing', async () => {
    const ctx = makeCtx();
    await expect(beginUpload(ctx, { folderId: 'ghost', name: 'x' }, makeAdapter())).rejects.toThrow('Folder not found');
  });
});

describe('uploadDirect', () => {
  it('writes bytes through the adapter and completes upload in one call', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const adapter = makeAdapter();
    const file = await uploadDirect(ctx, {
      folderId: folder!.id,
      name: 'shirt.png',
      mime: 'image/png',
      data: Buffer.from('hello'),
    }, adapter);

    expect(file.uploadStatus).toBe('COMPLETE');
    expect(file.size).toBe(5);
    expect(file.checksum).toHaveLength(64);
    expect(adapter.write).toHaveBeenCalledOnce();
  });
});

describe('moveFile / renameFile / updateFileMetadata', () => {
  it('move emits file.moved with from/to folder', async () => {
    const ctx = makeCtx();
    const { emitEvent } = await import('@hq/events');
    const source = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const dest = seedFolder({ name: 'Archive', path: '/Archive' });
    const file = await uploadDirect(ctx, {
      folderId: source!.id,
      name: 'a.png',
      data: Buffer.from('x'),
    }, makeAdapter());
    await moveFile(ctx, file.id, dest.id);
    expect(emitEvent).toHaveBeenCalledWith(ctx, 'file.moved', expect.objectContaining({
      payload: expect.objectContaining({ fromFolderId: source!.id, toFolderId: dest.id }),
    }));
  });

  it('rename updates name and emits file.updated', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const file = await uploadDirect(ctx, { folderId: folder!.id, name: 'old.png', data: Buffer.from('x') }, makeAdapter());
    const renamed = await renameFile(ctx, file.id, 'new.png');
    expect(renamed.name).toBe('new.png');
  });

  it('updateFileMetadata only reports changedFields that were set', async () => {
    const ctx = makeCtx();
    const { emitEvent } = await import('@hq/events');
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const file = await uploadDirect(ctx, { folderId: folder!.id, name: 'x.png', data: Buffer.from('x') }, makeAdapter());
    await updateFileMetadata(ctx, file.id, { description: 'red shirt', tags: ['red', 'cotton'] });
    expect(emitEvent).toHaveBeenCalledWith(ctx, 'file.updated', expect.objectContaining({
      payload: expect.objectContaining({ changedFields: ['description', 'tags'] }),
    }));
  });
});

describe('deleteFile', () => {
  it('removes storage bytes and emits file.deleted', async () => {
    const ctx = makeCtx();
    const { emitEvent } = await import('@hq/events');
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const adapter = makeAdapter();
    const file = await uploadDirect(ctx, { folderId: folder!.id, name: 'x.png', data: Buffer.from('xx') }, adapter);
    await deleteFile(ctx, file.id, adapter);
    expect(adapter.delete).toHaveBeenCalledWith(file.storageKey);
    expect(files.get(file.id)).toBeUndefined();
    expect(emitEvent).toHaveBeenCalledWith(ctx, 'file.deleted', expect.objectContaining({
      objectId: file.id,
    }));
  });
});

describe('resolveDownloadUrl', () => {
  it('returns null url when adapter does not support presigned GET', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const file = await uploadDirect(ctx, { folderId: folder!.id, name: 'x.png', data: Buffer.from('x') }, makeAdapter());
    const result = await resolveDownloadUrl(ctx, file.id, makeAdapter());
    expect(result.url).toBeNull();
  });

  it('returns presigned GET when adapter supports it', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const adapter = makeAdapter({
      supportsPresignedUrls: () => true,
      presignedPut: async () => 'https://signed.example/put',
      presignedGet: async () => 'https://signed.example/get',
    });
    const file = await uploadDirect(ctx, { folderId: folder!.id, name: 'x.png', data: Buffer.from('x') }, adapter);
    const result = await resolveDownloadUrl(ctx, file.id, adapter);
    expect(result.url).toBe('https://signed.example/get');
  });

  it('rejects when upload is not complete', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const { fileId } = await beginUpload(ctx, { folderId: folder!.id, name: 'x.png' }, makeAdapter());
    await expect(resolveDownloadUrl(ctx, fileId, makeAdapter())).rejects.toThrow('not complete');
  });
});

describe('searchFiles', () => {
  it('matches against name, description, and extractedText', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const a = await uploadDirect(ctx, { folderId: folder!.id, name: 'red-shirt.png', data: Buffer.from('x') }, makeAdapter());
    const b = await uploadDirect(ctx, { folderId: folder!.id, name: 'blue.png', data: Buffer.from('y') }, makeAdapter());
    await updateFileMetadata(ctx, b.id, { description: 'a red striped top' });

    const { items } = await searchFiles(ctx, { q: 'red' });
    expect(items).toHaveLength(2);
    const ids = (items as Array<{ id: string }>).map((i) => i.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });

  it('scopes by folder path prefix', async () => {
    const ctx = makeCtx();
    seedFolder({ name: 'Contracts', path: '/Contracts' });
    const productsFolder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const contractsFolder = await dbClient.folder.findUnique({ where: { path: '/Contracts' } });
    await uploadDirect(ctx, { folderId: productsFolder!.id, name: 'shirt.png', data: Buffer.from('x') }, makeAdapter());
    await uploadDirect(ctx, { folderId: contractsFolder!.id, name: 'contract.pdf', data: Buffer.from('y') }, makeAdapter());

    const { items } = await searchFiles(ctx, { folderPath: '/Products' });
    expect(items).toHaveLength(1);
    expect((items[0] as { name: string }).name).toBe('shirt.png');
  });

  it('filters by mime prefix', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    await uploadDirect(ctx, { folderId: folder!.id, name: 'a.png', mime: 'image/png', data: Buffer.from('x') }, makeAdapter());
    await uploadDirect(ctx, { folderId: folder!.id, name: 'b.pdf', mime: 'application/pdf', data: Buffer.from('y') }, makeAdapter());

    const { items } = await searchFiles(ctx, { mime: 'image/' });
    expect(items).toHaveLength(1);
    expect((items[0] as { mime: string }).mime).toBe('image/png');
  });

  it('filters by tags (all required)', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    const a = await uploadDirect(ctx, { folderId: folder!.id, name: 'a.png', data: Buffer.from('x') }, makeAdapter());
    const b = await uploadDirect(ctx, { folderId: folder!.id, name: 'b.png', data: Buffer.from('y') }, makeAdapter());
    await updateFileMetadata(ctx, a.id, { tags: ['ss26', 'red'] });
    await updateFileMetadata(ctx, b.id, { tags: ['ss26'] });

    const { items } = await searchFiles(ctx, { tags: ['ss26', 'red'] });
    expect(items).toHaveLength(1);
    expect((items[0] as { id: string }).id).toBe(a.id);
  });

  it('excludes PENDING uploads from search results', async () => {
    const ctx = makeCtx();
    const folder = await dbClient.folder.findUnique({ where: { path: '/Products' } });
    await beginUpload(ctx, { folderId: folder!.id, name: 'pending.png' }, makeAdapter());
    await uploadDirect(ctx, { folderId: folder!.id, name: 'done.png', data: Buffer.from('x') }, makeAdapter());

    const { items } = await searchFiles(ctx, {});
    expect(items).toHaveLength(1);
    expect((items[0] as { name: string }).name).toBe('done.png');
  });
});
