import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';

// ── Mock DB-touching modules before importing routes ─────────────────────────

vi.mock('@hq/db', () => ({ db: {} }));

vi.mock('@hq/services', () => ({
  createServiceContext: vi.fn().mockReturnValue({ actor: {}, dbClient: {}, now: () => new Date(), logger: console }),
}));

vi.mock('@hq/storage', () => {
  const adapter = {
    driver: 'fake',
    supportsPresignedUrls: vi.fn().mockReturnValue(false),
    presignedPut: vi.fn().mockResolvedValue('https://signed.example/put'),
    presignedGet: vi.fn().mockResolvedValue('https://signed.example/get'),
    write: vi.fn().mockResolvedValue(undefined),
    readBuffer: vi.fn().mockResolvedValue(Buffer.alloc(0)),
    readStream: vi.fn().mockResolvedValue(Readable.from([])),
    delete: vi.fn().mockResolvedValue(undefined),
    publicUrl: vi.fn().mockReturnValue(null),
  };
  return { getStorageAdapter: () => adapter };
});

vi.mock('@hq/files', () => ({
  beginUpload: vi.fn(),
  completeUpload: vi.fn(),
  getFile: vi.fn(),
  openFileStream: vi.fn(),
  resolveDownloadUrl: vi.fn(),
  moveFile: vi.fn(),
  renameFile: vi.fn(),
  updateFileMetadata: vi.fn(),
  deleteFile: vi.fn(),
  searchFiles: vi.fn(),
  getFolderByPath: vi.fn(),
  createFolder: vi.fn(),
  ensureFolder: vi.fn(),
  renameFolder: vi.fn(),
  moveFolder: vi.fn(),
  deleteFolder: vi.fn(),
  listFolders: vi.fn(),
}));

const requireAuthMock = vi.fn().mockResolvedValue({
  kind: 'user', source: 'session', userId: 'u1', email: 't@t.com',
  dbRole: 'MEMBER', effectiveRole: 'MEMBER', isSuperadmin: false,
  scopes: ['file.read', 'file.write', 'file.delete', 'folder.read', 'folder.write', 'folder.delete'],
  permissions: {},
});

vi.mock('../../lib/auth.js', () => ({
  requireAuth: requireAuthMock,
}));

// Mock auth/middleware — required indirectly because requireAuth imports from it
vi.mock('@hq/auth/middleware', () => ({ resolveAuth: vi.fn() }));

const files = await import('@hq/files');
const { registerFilesRoutes } = await import('../../routes/v1/files.js');
const { ApiError, inferStatusFromError, inferCodeFromStatus } = await import('../../lib/errors.js');

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = inferStatusFromError(error);
    const code = error instanceof ApiError ? error.code : inferCodeFromStatus(statusCode);
    return reply.code(statusCode).send({
      error: { code, message: error instanceof Error ? error.message : 'Unexpected error.' },
    });
  });
  await registerFilesRoutes(app);
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({
    kind: 'user', source: 'session', userId: 'u1', email: 't@t.com',
    dbRole: 'MEMBER', effectiveRole: 'MEMBER', isSuperadmin: false,
    scopes: ['file.read', 'file.write', 'file.delete', 'folder.read', 'folder.write', 'folder.delete'],
    permissions: {},
  });
});

describe('Auth enforcement', () => {
  it('returns 401 when requireAuth rejects', async () => {
    requireAuthMock.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.'));
    const res = await app.inject({ method: 'GET', url: '/v1/folders' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when bot lacks scope', async () => {
    requireAuthMock.mockRejectedValue(new ApiError(403, 'FORBIDDEN', "Missing required bot scope 'file.read'."));
    const res = await app.inject({ method: 'GET', url: '/v1/files/search' });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('uses correct botScope on each endpoint', async () => {
    vi.mocked(files.listFolders).mockResolvedValue([] as never);
    vi.mocked(files.searchFiles).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(files.createFolder).mockResolvedValue({ id: 'f1' } as never);
    vi.mocked(files.deleteFolder).mockResolvedValue(undefined);
    vi.mocked(files.deleteFile).mockResolvedValue(undefined);
    vi.mocked(files.beginUpload).mockResolvedValue({ fileId: 'x', storageKey: 'files/x', method: 'passthrough', uploadUrl: null, expiresInSeconds: 0 });

    await app.inject({ method: 'GET', url: '/v1/folders' });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'folder.read' });

    await app.inject({ method: 'POST', url: '/v1/folders', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X' }) });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'folder.write' });

    await app.inject({ method: 'DELETE', url: '/v1/folders/f1' });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'folder.delete' });

    await app.inject({ method: 'GET', url: '/v1/files/search' });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'file.read' });

    await app.inject({
      method: 'POST', url: '/v1/files',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId: 'f1', name: 'x.png' }),
    });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'file.write' });

    await app.inject({ method: 'DELETE', url: '/v1/files/file_1' });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'file.delete' });
  });
});

describe('POST /v1/files (beginUpload)', () => {
  it('returns 400 for missing folderId', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/files',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x.png' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns beginUpload result', async () => {
    vi.mocked(files.beginUpload).mockResolvedValue({
      fileId: 'file_1',
      storageKey: 'files/file_1',
      method: 'presigned',
      uploadUrl: 'https://signed.example/put',
      expiresInSeconds: 900,
    });
    const res = await app.inject({
      method: 'POST', url: '/v1/files',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId: 'fld_1', name: 'x.png', mime: 'image/png' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.fileId).toBe('file_1');
    expect(body.method).toBe('presigned');
  });
});

describe('POST /v1/files/:id/upload (passthrough)', () => {
  it('returns 409 when file already COMPLETE', async () => {
    vi.mocked(files.getFile).mockResolvedValue({
      id: 'file_1', storageKey: 'files/file_1', mime: 'image/png', uploadStatus: 'COMPLETE',
    } as never);
    const res = await app.inject({
      method: 'POST', url: '/v1/files/file_1/upload',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('bytes'),
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('ALREADY_UPLOADED');
  });

  it('writes bytes and completes upload', async () => {
    vi.mocked(files.getFile).mockResolvedValue({
      id: 'file_1', storageKey: 'files/file_1', mime: 'image/png', uploadStatus: 'PENDING',
    } as never);
    vi.mocked(files.completeUpload).mockResolvedValue({ id: 'file_1', uploadStatus: 'COMPLETE', size: 5 } as never);
    const res = await app.inject({
      method: 'POST', url: '/v1/files/file_1/upload',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('hello'),
    });
    expect(res.statusCode).toBe(200);
    expect(files.completeUpload).toHaveBeenCalledWith(expect.anything(), 'file_1', { size: 5, checksum: undefined });
  });
});

describe('GET /v1/files/:id/download', () => {
  it('302 redirects when presigned URL is available', async () => {
    vi.mocked(files.resolveDownloadUrl).mockResolvedValue({
      file: { id: 'file_1', name: 'x.png', mime: 'image/png', size: 5 } as never,
      url: 'https://signed.example/get',
    });
    const res = await app.inject({ method: 'GET', url: '/v1/files/file_1/download' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://signed.example/get');
  });

  it('streams bytes when presigned is unavailable', async () => {
    vi.mocked(files.resolveDownloadUrl).mockResolvedValue({
      file: { id: 'file_1', name: 'x.png', mime: 'image/png', size: 5 } as never,
      url: null,
    });
    vi.mocked(files.openFileStream).mockResolvedValue({
      file: { id: 'file_1', name: 'x.png', mime: 'image/png', size: 5 } as never,
      stream: Readable.from([Buffer.from('hello')]),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/files/file_1/download' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body).toBe('hello');
  });
});

describe('GET /v1/files/search', () => {
  it('parses tags query as CSV', async () => {
    vi.mocked(files.searchFiles).mockResolvedValue({ items: [], nextCursor: null });
    await app.inject({ method: 'GET', url: '/v1/files/search?tags=red,ss26&folderPath=/Products' });
    expect(files.searchFiles).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: ['red', 'ss26'], folderPath: '/Products' }),
    );
  });
});

describe('POST /v1/folders', () => {
  it('returns 400 for empty name', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/folders',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('calls createFolder with parsed body', async () => {
    vi.mocked(files.createFolder).mockResolvedValue({ id: 'fld_1', path: '/Products', name: 'Products' } as never);
    const res = await app.inject({
      method: 'POST', url: '/v1/folders',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Products', kind: 'USER' }),
    });
    expect(res.statusCode).toBe(200);
    expect(files.createFolder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: 'Products', kind: 'USER' }));
  });
});

describe('GET /v1/folders/by-path', () => {
  it('returns 404 when folder is missing', async () => {
    vi.mocked(files.getFolderByPath).mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/v1/folders/by-path?path=/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('returns the folder', async () => {
    vi.mocked(files.getFolderByPath).mockResolvedValue({ id: 'fld_1', path: '/Products' } as never);
    const res = await app.inject({ method: 'GET', url: '/v1/folders/by-path?path=/Products' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('fld_1');
  });
});

describe('POST /v1/folders/ensure', () => {
  it('validates path must start with slash', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/folders/ensure',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('calls ensureFolder and returns leaf', async () => {
    vi.mocked(files.ensureFolder).mockResolvedValue({ id: 'leaf', path: '/A/B' } as never);
    const res = await app.inject({
      method: 'POST', url: '/v1/folders/ensure',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/A/B' }),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('leaf');
  });
});

describe('POST /v1/files/:id/move and /rename', () => {
  it('moveFile passes folderId', async () => {
    vi.mocked(files.moveFile).mockResolvedValue({ id: 'file_1', folderId: 'fld_2' } as never);
    await app.inject({
      method: 'POST', url: '/v1/files/file_1/move',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId: 'fld_2' }),
    });
    expect(files.moveFile).toHaveBeenCalledWith(expect.anything(), 'file_1', 'fld_2');
  });

  it('renameFile passes name', async () => {
    vi.mocked(files.renameFile).mockResolvedValue({ id: 'file_1', name: 'new.png' } as never);
    await app.inject({
      method: 'POST', url: '/v1/files/file_1/rename',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'new.png' }),
    });
    expect(files.renameFile).toHaveBeenCalledWith(expect.anything(), 'file_1', 'new.png');
  });
});

describe('DELETE /v1/files/:id', () => {
  it('calls deleteFile and returns success', async () => {
    vi.mocked(files.deleteFile).mockResolvedValue(undefined);
    const res = await app.inject({ method: 'DELETE', url: '/v1/files/file_1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
  });

  it('returns 404 when the service throws "File not found."', async () => {
    vi.mocked(files.deleteFile).mockRejectedValue(new Error('File not found.'));
    const res = await app.inject({ method: 'DELETE', url: '/v1/files/missing' });
    expect(res.statusCode).toBe(404);
  });
});
