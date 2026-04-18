import type { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import type { ServiceContext } from '@hq/services';
import { emitEvent } from '@hq/events';
import { getStorageAdapter } from '@hq/storage';
import type { StorageAdapter, StorageBytes } from '@hq/storage';

/** `"files/{fileId}"` — we keep storage keys flat and opaque. */
function storageKeyFor(fileId: string): string {
  return `files/${fileId}`;
}

function sha256Hex(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export interface BeginUploadInput {
  folderId: string;
  name: string;
  mime?: string;
  size?: number;
}

export interface BeginUploadResult {
  fileId: string;
  storageKey: string;
  /** `"presigned"` → client PUTs to `uploadUrl`. `"passthrough"` → client POSTs multipart to the API. */
  method: 'presigned' | 'passthrough';
  uploadUrl: string | null;
  /** Seconds the presigned URL is valid for. Only meaningful when method="presigned". */
  expiresInSeconds: number;
}

const PRESIGN_EXPIRY = 15 * 60; // 15 minutes

/**
 * Begin a two-step upload. Creates a FileObject in PENDING status and returns
 * either a presigned PUT URL (S3) or a sentinel for the passthrough API route
 * (local driver). `completeUpload` finalizes the record once bytes are in
 * place.
 */
export async function beginUpload(
  ctx: ServiceContext,
  input: BeginUploadInput,
  adapter: StorageAdapter = getStorageAdapter(),
): Promise<BeginUploadResult> {
  const folder = await ctx.dbClient.folder.findUnique({ where: { id: input.folderId } });
  if (!folder) throw new Error('Folder not found.');

  const name = input.name.trim();
  if (!name) throw new Error('File name cannot be empty.');

  const mime = input.mime ?? 'application/octet-stream';
  const size = input.size ?? 0;
  const userId = ctx.actor.kind === 'user' ? ctx.actor.userId : null;

  const file = await ctx.dbClient.fileObject.create({
    data: {
      folderId: input.folderId,
      name,
      mime,
      size,
      storageKey: '', // filled in immediately below now that we know the id
      uploadStatus: 'PENDING',
      createdByUserId: userId,
    },
  });

  const storageKey = storageKeyFor(file.id);
  await ctx.dbClient.fileObject.update({ where: { id: file.id }, data: { storageKey } });

  if (adapter.supportsPresignedUrls()) {
    const uploadUrl = await adapter.presignedPut(storageKey, mime, Math.max(size, 1), PRESIGN_EXPIRY);
    return {
      fileId: file.id,
      storageKey,
      method: 'presigned',
      uploadUrl,
      expiresInSeconds: PRESIGN_EXPIRY,
    };
  }

  return {
    fileId: file.id,
    storageKey,
    method: 'passthrough',
    uploadUrl: null,
    expiresInSeconds: 0,
  };
}

export interface CompleteUploadInput {
  size?: number;
  checksum?: string;
  mime?: string;
}

/**
 * Finalize a PENDING file. Called after presigned PUT completes (S3) or after
 * the passthrough API route has written bytes to the adapter. Emits
 * `file.created` so downstream indexers see the file for the first time.
 */
export async function completeUpload(
  ctx: ServiceContext,
  fileId: string,
  input: CompleteUploadInput = {},
) {
  const file = await ctx.dbClient.fileObject.findUnique({ where: { id: fileId } });
  if (!file) throw new Error('File not found.');
  if (file.uploadStatus === 'COMPLETE') return file;

  const updated = await ctx.dbClient.fileObject.update({
    where: { id: fileId },
    data: {
      uploadStatus: 'COMPLETE',
      uploadedAt: ctx.now(),
      size: input.size ?? file.size,
      checksum: input.checksum ?? file.checksum,
      mime: input.mime ?? file.mime,
    },
  });

  await emitEvent(ctx, 'file.created', {
    objectType: 'FileObject',
    objectId: updated.id,
    payload: {
      id: updated.id,
      folderId: updated.folderId,
      name: updated.name,
      mime: updated.mime,
      size: updated.size,
    },
  });

  return updated;
}

export interface UploadDirectInput {
  folderId: string;
  name: string;
  mime?: string;
  data: Buffer | Uint8Array | Readable;
}

/**
 * Server-side one-shot upload for small files. Avoids the two-step dance —
 * the caller hands us bytes, we write them through the adapter and emit
 * `file.created` in a single call. Preferred path from the API multipart
 * upload route and from background workers.
 */
export async function uploadDirect(
  ctx: ServiceContext,
  input: UploadDirectInput,
  adapter: StorageAdapter = getStorageAdapter(),
) {
  const begin = await beginUpload(
    ctx,
    { folderId: input.folderId, name: input.name, mime: input.mime },
    adapter,
  );

  let size = 0;
  let checksum: string | undefined;

  if (input.data instanceof Uint8Array || Buffer.isBuffer(input.data)) {
    const buffer = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data);
    await adapter.write(begin.storageKey, buffer as StorageBytes, { mime: input.mime });
    size = buffer.byteLength;
    checksum = sha256Hex(buffer);
  } else {
    await adapter.write(begin.storageKey, input.data, { mime: input.mime });
    // We don't know size/checksum from a raw stream without buffering; caller
    // can supply either via a later completeUpload if they need them.
  }

  return completeUpload(ctx, begin.fileId, { size, checksum, mime: input.mime });
}

export async function getFile(ctx: ServiceContext, id: string) {
  const file = await ctx.dbClient.fileObject.findUnique({ where: { id } });
  if (!file) throw new Error('File not found.');
  return file;
}

/** Server-side download. Returns an adapter stream plus metadata for routing. */
export async function openFileStream(
  ctx: ServiceContext,
  id: string,
  adapter: StorageAdapter = getStorageAdapter(),
) {
  const file = await getFile(ctx, id);
  if (file.uploadStatus !== 'COMPLETE') throw new Error('File upload not complete.');
  const stream = await adapter.readStream(file.storageKey);
  return { file, stream };
}

/**
 * Download URL resolver. When the adapter supports presigned GETs we return
 * a short-lived URL so the client can download directly; otherwise the
 * caller should stream bytes through the API route.
 */
export async function resolveDownloadUrl(
  ctx: ServiceContext,
  id: string,
  adapter: StorageAdapter = getStorageAdapter(),
) {
  const file = await getFile(ctx, id);
  if (file.uploadStatus !== 'COMPLETE') throw new Error('File upload not complete.');
  if (!adapter.supportsPresignedUrls()) return { file, url: null as string | null };
  const url = await adapter.presignedGet(file.storageKey, PRESIGN_EXPIRY);
  return { file, url };
}

export async function moveFile(ctx: ServiceContext, id: string, newFolderId: string) {
  const file = await getFile(ctx, id);
  if (file.folderId === newFolderId) return file;
  const folder = await ctx.dbClient.folder.findUnique({ where: { id: newFolderId } });
  if (!folder) throw new Error('Destination folder not found.');

  const updated = await ctx.dbClient.fileObject.update({
    where: { id },
    data: { folderId: newFolderId },
  });

  await emitEvent(ctx, 'file.moved', {
    objectType: 'FileObject',
    objectId: id,
    payload: { id, fromFolderId: file.folderId, toFolderId: newFolderId },
  });
  return updated;
}

export async function renameFile(ctx: ServiceContext, id: string, newName: string) {
  const name = newName.trim();
  if (!name) throw new Error('File name cannot be empty.');
  const file = await getFile(ctx, id);
  if (file.name === name) return file;

  const updated = await ctx.dbClient.fileObject.update({
    where: { id },
    data: { name },
  });

  await emitEvent(ctx, 'file.updated', {
    objectType: 'FileObject',
    objectId: id,
    payload: { id, changedFields: ['name'] },
  });
  return updated;
}

/**
 * Update file metadata (description, extractedText, tags, metadata). Used by
 * indexers, OCR pipelines, or any enrichment flow. Emits `file.updated` with
 * the changed field names so downstream search indexers can re-index
 * selectively.
 */
export interface UpdateFileMetadataInput {
  description?: string | null;
  extractedText?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
  indexStatus?: 'PENDING' | 'EXTRACTING' | 'INDEXED' | 'SKIPPED' | 'FAILED';
  indexedAt?: Date | null;
}

export async function updateFileMetadata(
  ctx: ServiceContext,
  id: string,
  input: UpdateFileMetadataInput,
) {
  const data: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) {
      data[k] = v;
      changed.push(k);
    }
  }
  if (changed.length === 0) return getFile(ctx, id);

  const updated = await ctx.dbClient.fileObject.update({ where: { id }, data });

  await emitEvent(ctx, 'file.updated', {
    objectType: 'FileObject',
    objectId: id,
    payload: { id, changedFields: changed },
  });
  return updated;
}

/**
 * Delete a file. Removes storage bytes best-effort (failures logged, not
 * thrown — the DB row deletion is the source of truth).
 */
export async function deleteFile(
  ctx: ServiceContext,
  id: string,
  adapter: StorageAdapter = getStorageAdapter(),
) {
  const file = await getFile(ctx, id);
  try {
    await adapter.delete(file.storageKey);
  } catch (err) {
    ctx.logger.warn(`[files] failed to delete storage key ${file.storageKey}: ${(err as Error).message}`);
  }
  await ctx.dbClient.fileObject.delete({ where: { id } });

  await emitEvent(ctx, 'file.deleted', {
    objectType: 'FileObject',
    objectId: id,
    payload: { id, folderId: file.folderId, storageKey: file.storageKey },
  });
}
