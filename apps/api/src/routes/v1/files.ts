import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createServiceContext } from '@hq/services';
import {
  beginUpload,
  completeUpload,
  getFile,
  openFileStream,
  resolveDownloadUrl,
  moveFile,
  renameFile,
  updateFileMetadata,
  deleteFile,
  searchFiles,
  getFolderByPath,
  createFolder,
  ensureFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  listFolders,
} from '@hq/files';
import { getStorageAdapter } from '@hq/storage';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

const idParamsSchema = z.object({ id: z.string().min(1) });

const beginBodySchema = z.object({
  folderId: z.string().min(1),
  name: z.string().trim().min(1).max(512),
  mime: z.string().min(1).max(200).optional(),
  size: z.number().int().min(0).optional(),
});

const completeBodySchema = z.object({
  size: z.number().int().min(0).optional(),
  checksum: z.string().min(1).max(256).optional(),
  mime: z.string().min(1).max(200).optional(),
});

const moveBodySchema = z.object({ folderId: z.string().min(1) });
const renameBodySchema = z.object({ name: z.string().trim().min(1).max(512) });

const metadataBodySchema = z.object({
  description: z.string().max(10_000).nullable().optional(),
  extractedText: z.string().max(2_000_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  indexStatus: z.enum(['PENDING', 'EXTRACTING', 'INDEXED', 'SKIPPED', 'FAILED']).optional(),
});

const searchQuerySchema = z.object({
  q: z.string().optional(),
  folderId: z.string().optional(),
  folderPath: z.string().optional(),
  mime: z.string().optional(),
  tags: z
    .union([z.string(), z.array(z.string())])
    .transform((v): string[] => (Array.isArray(v) ? v : v.split(',').map((s) => s.trim()).filter(Boolean)))
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

const folderCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(256),
  parentId: z.string().min(1).nullable().optional(),
  kind: z.enum(['USER', 'SYSTEM', 'TEMP']).optional(),
  retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
});

const folderEnsureBodySchema = z.object({
  path: z.string().trim().min(2),
  kind: z.enum(['USER', 'SYSTEM', 'TEMP']).optional(),
});

const folderIdParamsSchema = z.object({ id: z.string().min(1) });
const folderMoveBodySchema = z.object({ parentId: z.string().nullable() });
const folderRenameBodySchema = z.object({ name: z.string().trim().min(1).max(256) });
const folderListQuerySchema = z.object({
  parentId: z.string().optional(),
  pathPrefix: z.string().optional(),
  kind: z.enum(['USER', 'SYSTEM', 'TEMP']).optional(),
});
const byPathQuerySchema = z.object({ path: z.string().min(1) });

function parseBody<T>(input: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid request payload.', parsed.error.flatten());
  }
  return parsed.data;
}

function parseQuery<T>(input: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid query parameters.', parsed.error.flatten());
  }
  return parsed.data;
}

/**
 * Pulls raw bytes out of a Fastify request body. We accept either a Buffer
 * (when the body is `application/octet-stream`) or a base64-encoded JSON
 * object `{ data: "..." }` — the latter keeps this route usable from any
 * HTTP client without a multipart parser.
 */
async function readRawBody(request: FastifyRequest): Promise<Buffer> {
  const body = request.body;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body && typeof body === 'object' && 'data' in body) {
    const data = (body as { data: unknown }).data;
    if (typeof data === 'string') return Buffer.from(data, 'base64');
  }
  throw new ApiError(400, 'BAD_REQUEST', 'Upload body must be raw bytes or { data: base64 }.');
}

export async function registerFilesRoutes(app: FastifyInstance) {
  // Accept raw octet-stream bodies up to 100 MB for passthrough uploads.
  app.addContentTypeParser<Buffer>(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: 100 * 1024 * 1024 },
    async (_request: FastifyRequest, payload: Buffer) => payload,
  );

  // ── Folder routes ────────────────────────────────────────────────────────

  app.get('/v1/folders', async (request) => {
    const actor = await requireAuth(request, { botScope: 'folder.read' });
    const ctx = createServiceContext(actor);
    const query = parseQuery(request.query, folderListQuerySchema);
    return { items: await listFolders(ctx, query) };
  });

  app.get('/v1/folders/by-path', async (request) => {
    const actor = await requireAuth(request, { botScope: 'folder.read' });
    const ctx = createServiceContext(actor);
    const { path } = parseQuery(request.query, byPathQuerySchema);
    const folder = await getFolderByPath(ctx, path);
    if (!folder) throw new ApiError(404, 'NOT_FOUND', `No folder at path: ${path}`);
    return folder;
  });

  app.post('/v1/folders', async (request) => {
    const actor = await requireAuth(request, { botScope: 'folder.write' });
    const ctx = createServiceContext(actor);
    const body = parseBody(request.body, folderCreateBodySchema);
    return createFolder(ctx, body);
  });

  app.post('/v1/folders/ensure', async (request) => {
    const actor = await requireAuth(request, { botScope: 'folder.write' });
    const ctx = createServiceContext(actor);
    const { path, kind } = parseBody(request.body, folderEnsureBodySchema);
    return ensureFolder(ctx, path, kind);
  });

  app.post('/v1/folders/:id/rename', async (request) => {
    const actor = await requireAuth(request, { botScope: 'folder.write' });
    const ctx = createServiceContext(actor);
    const { id } = folderIdParamsSchema.parse(request.params);
    const { name } = parseBody(request.body, folderRenameBodySchema);
    return renameFolder(ctx, id, name);
  });

  app.post('/v1/folders/:id/move', async (request) => {
    const actor = await requireAuth(request, { botScope: 'folder.write' });
    const ctx = createServiceContext(actor);
    const { id } = folderIdParamsSchema.parse(request.params);
    const { parentId } = parseBody(request.body, folderMoveBodySchema);
    return moveFolder(ctx, id, parentId);
  });

  app.delete('/v1/folders/:id', async (request) => {
    const actor = await requireAuth(request, { botScope: 'folder.delete' });
    const ctx = createServiceContext(actor);
    const { id } = folderIdParamsSchema.parse(request.params);
    await deleteFolder(ctx, id);
    return { success: true };
  });

  // ── File routes ──────────────────────────────────────────────────────────

  /**
   * Begin a two-step upload. Returns either a presigned PUT URL (S3) or a
   * `"passthrough"` method directing the client to POST bytes to
   * `/v1/files/:id/upload`.
   */
  app.post('/v1/files', async (request) => {
    const actor = await requireAuth(request, { botScope: 'file.write' });
    const ctx = createServiceContext(actor);
    const body = parseBody(request.body, beginBodySchema);
    return beginUpload(ctx, body, getStorageAdapter());
  });

  /**
   * Passthrough upload for the local driver (and any other adapter that
   * doesn't support presigned URLs). Client POSTs `application/octet-stream`
   * bytes after calling `POST /v1/files`.
   */
  app.post('/v1/files/:id/upload', async (request) => {
    const actor = await requireAuth(request, { botScope: 'file.write' });
    const ctx = createServiceContext(actor);
    const { id } = idParamsSchema.parse(request.params);
    const file = await getFile(ctx, id);
    if (file.uploadStatus === 'COMPLETE') {
      throw new ApiError(409, 'ALREADY_UPLOADED', 'File upload is already complete.');
    }
    const buffer = await readRawBody(request);
    const adapter = getStorageAdapter();
    await adapter.write(file.storageKey, buffer, { mime: file.mime });
    return completeUpload(ctx, id, {
      size: buffer.byteLength,
      checksum: undefined,
    });
  });

  app.post('/v1/files/:id/complete', async (request) => {
    const actor = await requireAuth(request, { botScope: 'file.write' });
    const ctx = createServiceContext(actor);
    const { id } = idParamsSchema.parse(request.params);
    const body = parseBody(request.body, completeBodySchema);
    return completeUpload(ctx, id, body);
  });

  app.get('/v1/files/search', async (request) => {
    const actor = await requireAuth(request, { botScope: 'file.read' });
    const ctx = createServiceContext(actor);
    const query = parseQuery(request.query, searchQuerySchema);
    return searchFiles(ctx, {
      q: query.q,
      folderId: query.folderId,
      folderPath: query.folderPath,
      mime: query.mime,
      tags: query.tags as string[] | undefined,
      limit: query.limit,
      cursor: query.cursor,
    });
  });

  app.get('/v1/files/:id', async (request) => {
    const actor = await requireAuth(request, { botScope: 'file.read' });
    const ctx = createServiceContext(actor);
    const { id } = idParamsSchema.parse(request.params);
    return getFile(ctx, id);
  });

  /**
   * Download resolver. For adapters that support presigned GETs we 302
   * redirect so the browser hits storage directly; otherwise we stream bytes
   * through the API.
   */
  app.get('/v1/files/:id/download', async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await requireAuth(request, { botScope: 'file.read' });
    const ctx = createServiceContext(actor);
    const { id } = idParamsSchema.parse(request.params);
    const adapter = getStorageAdapter();
    const { file, url } = await resolveDownloadUrl(ctx, id, adapter);
    if (url) {
      return reply.redirect(url, 302);
    }
    const { stream } = await openFileStream(ctx, id, adapter);
    reply.header('content-type', file.mime || 'application/octet-stream');
    reply.header('content-disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
    if (file.size) reply.header('content-length', String(file.size));
    return reply.send(stream);
  });

  app.post('/v1/files/:id/move', async (request) => {
    const actor = await requireAuth(request, { botScope: 'file.write' });
    const ctx = createServiceContext(actor);
    const { id } = idParamsSchema.parse(request.params);
    const { folderId } = parseBody(request.body, moveBodySchema);
    return moveFile(ctx, id, folderId);
  });

  app.post('/v1/files/:id/rename', async (request) => {
    const actor = await requireAuth(request, { botScope: 'file.write' });
    const ctx = createServiceContext(actor);
    const { id } = idParamsSchema.parse(request.params);
    const { name } = parseBody(request.body, renameBodySchema);
    return renameFile(ctx, id, name);
  });

  app.patch('/v1/files/:id/metadata', async (request) => {
    const actor = await requireAuth(request, { botScope: 'file.write' });
    const ctx = createServiceContext(actor);
    const { id } = idParamsSchema.parse(request.params);
    const body = parseBody(request.body, metadataBodySchema);
    return updateFileMetadata(ctx, id, body);
  });

  app.delete('/v1/files/:id', async (request) => {
    const actor = await requireAuth(request, { botScope: 'file.delete' });
    const ctx = createServiceContext(actor);
    const { id } = idParamsSchema.parse(request.params);
    await deleteFile(ctx, id, getStorageAdapter());
    return { success: true };
  });
}
