/**
 * Temp-folder sweeper.
 *
 * Deletes files in `TEMP` folders that have a `retentionDays` set and whose
 * `uploadedAt` is older than that window. Intended to be invoked by a
 * recurring pg-boss job (see `apps/api/src/workers/files.ts`).
 */
import type { ServiceContext } from '@hq/services';
import { getStorageAdapter } from '@hq/storage';
import type { StorageAdapter } from '@hq/storage';
import { deleteFile } from './files.js';

export interface SweepResult {
  foldersScanned: number;
  filesDeleted: number;
  errors: Array<{ fileId: string; message: string }>;
}

export async function sweepTempFiles(
  ctx: ServiceContext,
  adapter: StorageAdapter = getStorageAdapter(),
): Promise<SweepResult> {
  const folders = await ctx.dbClient.folder.findMany({
    where: { kind: 'TEMP', retentionDays: { not: null } },
    select: { id: true, path: true, retentionDays: true },
  });

  const now = ctx.now();
  let filesDeleted = 0;
  const errors: SweepResult['errors'] = [];

  for (const folder of folders) {
    if (folder.retentionDays == null) continue;
    const cutoff = new Date(now.getTime() - folder.retentionDays * 24 * 60 * 60 * 1000);

    const folderIds = await collectDescendantFolderIds(ctx, folder.path, folder.id);
    const stale = await ctx.dbClient.fileObject.findMany({
      where: {
        folderId: { in: folderIds },
        uploadStatus: 'COMPLETE',
        uploadedAt: { lt: cutoff },
      },
      select: { id: true },
    });

    for (const file of stale) {
      try {
        await deleteFile(ctx, file.id, adapter);
        filesDeleted += 1;
      } catch (err) {
        errors.push({
          fileId: file.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { foldersScanned: folders.length, filesDeleted, errors };
}

async function collectDescendantFolderIds(
  ctx: ServiceContext,
  rootPath: string,
  rootId: string,
): Promise<string[]> {
  const descendants = await ctx.dbClient.folder.findMany({
    where: { path: { startsWith: `${rootPath}/` } },
    select: { id: true },
  });
  return [rootId, ...descendants.map((d) => d.id)];
}
