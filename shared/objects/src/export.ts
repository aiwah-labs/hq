import type { ServiceContext } from '@hq/services';
import { objectList } from './crud.js';
import { objects } from './registry.js';
import { getListFields } from './schema.js';
import type { FieldDefinition, ObjectDefinition } from './types.js';

export type ExportFormat = 'csv' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  /** Field names to include. Defaults to all list-visible fields. */
  fields?: string[];
  /** Max rows to export. Default 5000; hard cap 50000. */
  limit?: number;
  /** Optional simple filters passed through to `objectList`. */
  filters?: Record<string, unknown>;
  /** Optional search query passed through to `objectList`. */
  q?: string;
}

export interface ExportResult {
  contentType: string;
  filename: string;
  body: string;
  rowCount: number;
}

const HARD_CAP = 50_000;
const PAGE_SIZE = 500;

/** Values that render as-is; everything else is stringified or JSON-encoded. */
function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return escapeCsv(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || typeof value === 'object') return escapeCsv(JSON.stringify(value));
  return escapeCsv(String(value));
}

function escapeCsv(s: string): string {
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Default export fields: list-visible non-relation fields + always-present `id`. */
function defaultExportFields(def: ObjectDefinition): string[] {
  const listFields = getListFields(def)
    .filter(([, f]) => f.type !== 'relation')
    .map(([name]) => name);
  const out = new Set<string>(['id', ...listFields, 'createdAt', 'updatedAt']);
  // drop fields that don't exist on the definition (createdAt/updatedAt may
  // be Prisma-only and not declared in fields{}) — we still want them in the row.
  return Array.from(out);
}

function pickValue(row: Record<string, unknown>, field: string, def: FieldDefinition | undefined): unknown {
  const raw = row[field];
  if (def?.type === 'relation') {
    // only belongsTo fields are exportable; others stay as foreign key IDs
    return raw;
  }
  return raw;
}

/**
 * Stream an object's records into CSV or JSON, bounded by `limit` (max {@link HARD_CAP}).
 *
 * Policy is enforced via `objectList`, so principals only see what they're
 * allowed to read — including ownership-scoped rows for `own` access.
 */
export async function exportObject(
  type: string,
  opts: ExportOptions,
  ctx: ServiceContext,
): Promise<ExportResult> {
  const def = objects[type];
  if (!def) throw new Error(`Unknown object: ${type}`);

  const limit = Math.min(opts.limit ?? 5000, HARD_CAP);
  const fields = opts.fields && opts.fields.length > 0 ? opts.fields : defaultExportFields(def);

  const collected: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  while (collected.length < limit) {
    const take = Math.min(PAGE_SIZE, limit - collected.length);
    const page = await objectList(
      type,
      { q: opts.q, filters: opts.filters, limit: take, cursor: cursor ?? undefined },
      ctx,
    );
    collected.push(...(page.items as Record<string, unknown>[]));
    if (!page.nextCursor || (page.items as unknown[]).length < take) break;
    cursor = page.nextCursor;
  }

  if (opts.format === 'json') {
    const rows = collected.map((row) => {
      const out: Record<string, unknown> = {};
      for (const f of fields) out[f] = pickValue(row, f, def.fields[f]);
      return out;
    });
    return {
      contentType: 'application/json',
      filename: `${type.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`,
      body: JSON.stringify(rows, null, 2),
      rowCount: rows.length,
    };
  }

  // CSV
  const lines: string[] = [];
  lines.push(fields.map((f) => escapeCsv(f)).join(','));
  for (const row of collected) {
    lines.push(fields.map((f) => toCsvCell(pickValue(row, f, def.fields[f]))).join(','));
  }
  return {
    contentType: 'text/csv',
    filename: `${type.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
    body: lines.join('\n') + '\n',
    rowCount: collected.length,
  };
}
