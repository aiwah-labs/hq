import type { ServiceContext } from '@hq/services';
import { emitEvent } from '@hq/events';
import type { Prisma } from '@hq/db';

export type FolderKind = 'USER' | 'SYSTEM' | 'TEMP';

export interface CreateFolderInput {
  name: string;
  parentId?: string | null;
  kind?: FolderKind;
  retentionDays?: number | null;
  indexConfig?: Record<string, unknown> | null;
}

const ROOT_PATH = '';

function sanitizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name cannot be empty.');
  if (trimmed.includes('/')) throw new Error('Folder name cannot contain "/".');
  if (trimmed === '.' || trimmed === '..') throw new Error('Invalid folder name.');
  return trimmed;
}

function joinPath(parentPath: string, name: string): string {
  if (parentPath === ROOT_PATH) return `/${name}`;
  return `${parentPath}/${name}`;
}

/** Create a folder. Computes `path` from parent + name and enforces sibling uniqueness. */
export async function createFolder(ctx: ServiceContext, input: CreateFolderInput) {
  const name = sanitizeName(input.name);
  const parentId = input.parentId ?? null;

  let parentPath = ROOT_PATH;
  if (parentId) {
    const parent = await ctx.dbClient.folder.findUnique({ where: { id: parentId } });
    if (!parent) throw new Error('Parent folder not found.');
    parentPath = parent.path;
  }

  const path = joinPath(parentPath, name);

  const data: Prisma.FolderUncheckedCreateInput = {
    name,
    parentId,
    path,
    kind: input.kind ?? 'USER',
    retentionDays: input.retentionDays ?? null,
    createdByUserId: ctx.actor.kind === 'user' ? ctx.actor.userId : null,
  };
  if (input.indexConfig !== undefined && input.indexConfig !== null) {
    data.indexConfig = input.indexConfig as Prisma.InputJsonValue;
  }
  const folder = await ctx.dbClient.folder.create({ data });

  await emitEvent(ctx, 'folder.created', {
    objectType: 'Folder',
    objectId: folder.id,
    payload: { id: folder.id, parentId, path, kind: folder.kind },
  });

  return folder;
}

/**
 * Ensure a folder exists at the given absolute path, creating intermediate
 * folders as needed. Returns the leaf folder. Useful for auto-created
 * object-bound folders and system paths like `/System/Imports`.
 */
export async function ensureFolder(
  ctx: ServiceContext,
  absolutePath: string,
  kind: FolderKind = 'USER',
) {
  if (!absolutePath.startsWith('/')) {
    throw new Error('ensureFolder requires an absolute path starting with "/"');
  }
  const segments = absolutePath.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) throw new Error('ensureFolder cannot create the root.');

  let parentId: string | null = null;
  let accumulated = '';
  let folder = null as Awaited<ReturnType<typeof createFolder>> | null;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    accumulated = accumulated === '' ? `/${segment}` : `${accumulated}/${segment}`;
    const existing = await ctx.dbClient.folder.findUnique({ where: { path: accumulated } });
    if (existing) {
      folder = existing;
      parentId = existing.id;
      continue;
    }
    // Only the leaf adopts the requested kind; intermediate folders are USER.
    const nextKind: FolderKind = i === segments.length - 1 ? kind : 'USER';
    folder = await createFolder(ctx, { name: segment, parentId, kind: nextKind });
    parentId = folder.id;
  }

  if (!folder) throw new Error('ensureFolder produced no folder.');
  return folder;
}

export async function getFolder(ctx: ServiceContext, id: string) {
  const folder = await ctx.dbClient.folder.findUnique({ where: { id } });
  if (!folder) throw new Error('Folder not found.');
  return folder;
}

export async function getFolderByPath(ctx: ServiceContext, path: string) {
  return ctx.dbClient.folder.findUnique({ where: { path } });
}

export interface ListFoldersOptions {
  parentId?: string | null;
  kind?: FolderKind;
  pathPrefix?: string;
}

export async function listFolders(ctx: ServiceContext, opts: ListFoldersOptions = {}) {
  const where: Record<string, unknown> = {};
  if (opts.parentId !== undefined) where.parentId = opts.parentId;
  if (opts.kind) where.kind = opts.kind;
  if (opts.pathPrefix) where.path = { startsWith: opts.pathPrefix };
  return ctx.dbClient.folder.findMany({
    where,
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Rename a folder. Rewrites `path` on the folder and every descendant in a
 * single transaction (paths are denormalized so we must update all children).
 */
export async function renameFolder(ctx: ServiceContext, id: string, newName: string) {
  const name = sanitizeName(newName);
  const folder = await getFolder(ctx, id);
  if (folder.kind === 'SYSTEM') throw new Error('System folders cannot be renamed.');

  const parentPath = folder.path.includes('/')
    ? folder.path.slice(0, folder.path.lastIndexOf('/'))
    : '';
  const newPath = joinPath(parentPath, name);
  if (newPath === folder.path) return folder;

  const updated = await ctx.dbClient.$transaction(async (tx) => {
    await rewriteDescendantPaths(tx, folder.path, newPath);
    return tx.folder.update({ where: { id }, data: { name, path: newPath } });
  });

  await emitEvent(ctx, 'folder.updated', {
    objectType: 'Folder',
    objectId: id,
    payload: { id, oldPath: folder.path, newPath, changedFields: ['name', 'path'] },
  });
  return updated;
}

/** Move a folder under a new parent (or to the root when `newParentId` is null). */
export async function moveFolder(ctx: ServiceContext, id: string, newParentId: string | null) {
  const folder = await getFolder(ctx, id);
  if (folder.kind === 'SYSTEM') throw new Error('System folders cannot be moved.');
  if (newParentId === folder.parentId) return folder;

  let parentPath = ROOT_PATH;
  if (newParentId) {
    const parent = await ctx.dbClient.folder.findUnique({ where: { id: newParentId } });
    if (!parent) throw new Error('New parent folder not found.');
    if (parent.path === folder.path || parent.path.startsWith(`${folder.path}/`)) {
      throw new Error('Cannot move a folder into itself or one of its descendants.');
    }
    parentPath = parent.path;
  }

  const newPath = joinPath(parentPath, folder.name);
  const updated = await ctx.dbClient.$transaction(async (tx) => {
    await rewriteDescendantPaths(tx, folder.path, newPath);
    return tx.folder.update({ where: { id }, data: { parentId: newParentId, path: newPath } });
  });

  await emitEvent(ctx, 'folder.updated', {
    objectType: 'Folder',
    objectId: id,
    payload: { id, oldPath: folder.path, newPath, changedFields: ['parentId', 'path'] },
  });
  return updated;
}

/**
 * Delete a folder. Prisma cascades descendant folders and their files (see
 * schema `onDelete: Cascade`), but we still emit `folder.deleted` so indexers
 * can tear down external state. System folders are protected.
 */
export async function deleteFolder(ctx: ServiceContext, id: string) {
  const folder = await getFolder(ctx, id);
  if (folder.kind === 'SYSTEM') throw new Error('System folders cannot be deleted.');

  await ctx.dbClient.folder.delete({ where: { id } });

  await emitEvent(ctx, 'folder.deleted', {
    objectType: 'Folder',
    objectId: id,
    payload: { id, path: folder.path },
  });
}

/**
 * Rewrite path prefixes on every folder nested under `oldPrefix` to use
 * `newPrefix`. Used by rename + move to keep denormalized paths in sync.
 */
async function rewriteDescendantPaths(
  tx: Prisma.TransactionClient,
  oldPrefix: string,
  newPrefix: string,
): Promise<void> {
  const descendants = await tx.folder.findMany({
    where: { path: { startsWith: `${oldPrefix}/` } },
    select: { id: true, path: true },
  });
  for (const d of descendants) {
    const remainder = d.path.slice(oldPrefix.length);
    await tx.folder.update({ where: { id: d.id }, data: { path: `${newPrefix}${remainder}` } });
  }
}
