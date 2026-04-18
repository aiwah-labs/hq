import type { ServiceContext } from '@hq/services';

export interface FileSearchOptions {
  /** Query string matched against name + description + extractedText + tags (ILIKE). */
  q?: string;
  /** Absolute folder path prefix, e.g. `/Products`. Matches the folder and everything under it. */
  folderPath?: string;
  /** Single folder id. Mutually exclusive with `folderPath`. */
  folderId?: string;
  /** MIME prefix (e.g. `image/`) or exact type. */
  mime?: string;
  /** Tags — all must be present on the file. */
  tags?: string[];
  limit?: number;
  cursor?: string;
}

export interface FileSearchBackend {
  search(ctx: ServiceContext, opts: FileSearchOptions): Promise<FileSearchResult>;
}

export interface FileSearchResult {
  items: unknown[];
  nextCursor: string | null;
}

/**
 * Default keyword backend. Postgres ILIKE across `name`, `description`,
 * `extractedText`, and `tags`. Ships working out of the box — no FTS
 * configuration required. A separate vector/hybrid backend can replace
 * this via `setFileSearchBackend()`.
 */
const postgresFullTextBackend: FileSearchBackend = {
  async search(ctx, opts) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const where: Record<string, unknown> = {
      uploadStatus: 'COMPLETE',
    };

    if (opts.folderId) {
      where.folderId = opts.folderId;
    } else if (opts.folderPath) {
      // Match the folder itself plus every descendant.
      const paths = await ctx.dbClient.folder.findMany({
        where: {
          OR: [
            { path: opts.folderPath },
            { path: { startsWith: `${opts.folderPath}/` } },
          ],
        },
        select: { id: true },
      });
      if (paths.length === 0) return { items: [], nextCursor: null };
      where.folderId = { in: paths.map((p) => p.id) };
    }

    if (opts.mime) {
      where.mime = opts.mime.endsWith('/')
        ? { startsWith: opts.mime }
        : opts.mime;
    }
    if (opts.tags && opts.tags.length > 0) {
      where.tags = { hasEvery: opts.tags };
    }
    if (opts.q) {
      const q = opts.q;
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { extractedText: { contains: q, mode: 'insensitive' } },
        { tags: { has: q.toLowerCase() } },
      ];
    }

    const queryArgs: Record<string, unknown> = {
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
    };
    if (opts.cursor) {
      queryArgs.cursor = { id: opts.cursor };
      queryArgs.skip = 1;
    }

    const items = await ctx.dbClient.fileObject.findMany(queryArgs as never);
    let nextCursor: string | null = null;
    if (items.length > limit) {
      items.pop();
      nextCursor = (items[items.length - 1] as { id: string }).id;
    }
    return { items, nextCursor };
  },
};

let activeBackend: FileSearchBackend = postgresFullTextBackend;

/**
 * Swap the file search backend. Vector/hybrid search plugs in here without
 * API changes — the same `/v1/files/search` route calls the active backend.
 */
export function setFileSearchBackend(backend: FileSearchBackend): void {
  activeBackend = backend;
}

export function getFileSearchBackend(): FileSearchBackend {
  return activeBackend;
}

export async function searchFiles(ctx: ServiceContext, opts: FileSearchOptions) {
  return activeBackend.search(ctx, opts);
}
