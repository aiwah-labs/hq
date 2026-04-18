import type { ServiceContext } from '@hq/services';
import { assertCan } from '@hq/auth/policy';
import { objectCreate } from './crud.js';
import { objects } from './registry.js';
import type { FieldDefinition, ObjectDefinition } from './types.js';

export type ImportFormat = 'csv' | 'json';

export interface ImportParseOptions {
  format: ImportFormat;
  content: string;
  /** Map from source header/key → target field name. Empty string skips the column. */
  fieldMap?: Record<string, string>;
}

export interface ImportRowError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportPreview {
  /** Target fields the preview will write to (after fieldMap). */
  targetFields: string[];
  /** Source column headers as they appear in the payload. */
  sourceFields: string[];
  /** Detected fieldMap (defaults to identity when headers match target fields). */
  fieldMap: Record<string, string>;
  /** First N rows (default 20) after mapping + coercion; rows with errors still included. */
  sampleRows: Array<{ row: number; data: Record<string, unknown>; errors: ImportRowError[] }>;
  /** Total number of data rows detected in the payload. */
  totalRows: number;
  /** Aggregate error count across ALL rows, not just the sample. */
  errorCount: number;
  /** Aggregated file-level errors (bad format, unknown field, etc.). */
  fileErrors: string[];
}

export interface ImportResultSummary {
  created: number;
  failed: number;
  errors: ImportRowError[];
  totalRows: number;
}

export const DEFAULT_SAMPLE_SIZE = 20;

/**
 * Parse an input payload into row objects. Throws on gross format errors
 * (unbalanced quotes, malformed JSON) — per-row validation happens in
 * {@link validateImportRows}.
 */
export function parseImportContent(opts: ImportParseOptions): {
  rows: Record<string, unknown>[];
  sourceFields: string[];
} {
  if (opts.format === 'json') {
    const parsed = JSON.parse(opts.content);
    if (!Array.isArray(parsed)) {
      throw new Error('JSON import must be an array of objects.');
    }
    const sourceFields = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (const entry of parsed) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('Every JSON entry must be an object.');
      }
      for (const k of Object.keys(entry)) sourceFields.add(k);
      rows.push(entry as Record<string, unknown>);
    }
    return { rows, sourceFields: Array.from(sourceFields) };
  }

  // CSV
  const parsed = parseCsv(opts.content);
  if (parsed.length === 0) return { rows: [], sourceFields: [] };
  const [header, ...body] = parsed;
  const sourceFields = header.map((h) => h.trim());
  const rows = body.map((cols) => {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < sourceFields.length; i++) {
      row[sourceFields[i]] = cols[i] ?? '';
    }
    return row;
  });
  return { rows, sourceFields };
}

/** Build a fieldMap that passes through any source headers matching target field names. */
function defaultFieldMap(sourceFields: string[], def: ObjectDefinition): Record<string, string> {
  const out: Record<string, string> = {};
  const fieldNames = new Set(Object.keys(def.fields));
  for (const s of sourceFields) {
    if (fieldNames.has(s)) out[s] = s;
  }
  return out;
}

/** Apply `fieldMap` to a source row and return target-keyed data. */
function applyFieldMap(row: Record<string, unknown>, fieldMap: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [src, target] of Object.entries(fieldMap)) {
    if (!target) continue;
    if (row[src] !== undefined) out[target] = row[src];
  }
  return out;
}

/** Coerce one cell value based on the target field's declared type. Returns value or an error. */
function coerceCell(
  field: FieldDefinition,
  fieldName: string,
  raw: unknown,
  rowIndex: number,
): { value: unknown } | { error: ImportRowError } {
  // Missing / empty → undefined (required check happens in validate).
  if (raw === null || raw === undefined || raw === '') return { value: undefined };

  switch (field.type) {
    case 'string':
    case 'text': {
      return { value: typeof raw === 'string' ? raw : String(raw) };
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        return { error: { row: rowIndex, field: fieldName, message: `Expected a number, got "${String(raw)}".` } };
      }
      return { value: n };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { value: raw };
      const s = String(raw).trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return { value: true };
      if (s === 'false' || s === '0' || s === 'no' || s === 'n') return { value: false };
      return { error: { row: rowIndex, field: fieldName, message: `Expected true/false, got "${String(raw)}".` } };
    }
    case 'enum': {
      const s = String(raw);
      if (field.values && !field.values.includes(s)) {
        return {
          error: {
            row: rowIndex,
            field: fieldName,
            message: `Must be one of: ${field.values.join(', ')}. Got "${s}".`,
          },
        };
      }
      return { value: s };
    }
    case 'date': {
      const d = raw instanceof Date ? raw : new Date(String(raw));
      if (Number.isNaN(d.getTime())) {
        return { error: { row: rowIndex, field: fieldName, message: `Invalid date: "${String(raw)}".` } };
      }
      return { value: d };
    }
    case 'json': {
      if (typeof raw === 'string') {
        try {
          return { value: JSON.parse(raw) };
        } catch {
          return { error: { row: rowIndex, field: fieldName, message: `Invalid JSON.` } };
        }
      }
      return { value: raw };
    }
    case 'relation': {
      // Relations are imported as foreign-key strings; Prisma create uses the
      // `{field}Id` key. We pass the string through and let the caller decide.
      return { value: typeof raw === 'string' ? raw : String(raw) };
    }
    default:
      return { value: raw };
  }
}

/** Validate mapped rows against the object definition. Returns coerced rows + errors. */
export function validateImportRows(
  type: string,
  mappedRows: Record<string, unknown>[],
): { rows: Array<{ row: number; data: Record<string, unknown>; errors: ImportRowError[] }>; errorCount: number } {
  const def = objects[type];
  if (!def) throw new Error(`Unknown object: ${type}`);

  const out: Array<{ row: number; data: Record<string, unknown>; errors: ImportRowError[] }> = [];
  let errorCount = 0;

  for (let i = 0; i < mappedRows.length; i++) {
    const raw = mappedRows[i];
    const data: Record<string, unknown> = {};
    const errors: ImportRowError[] = [];
    const rowIndex = i + 1;

    for (const [fieldName, fieldDef] of Object.entries(def.fields)) {
      if (fieldDef.readonly) continue;
      const present = Object.prototype.hasOwnProperty.call(raw, fieldName);
      if (!present) {
        if (fieldDef.required && fieldDef.defaultValue === undefined) {
          errors.push({ row: rowIndex, field: fieldName, message: `Required field missing.` });
        }
        continue;
      }
      const coerced = coerceCell(fieldDef, fieldName, raw[fieldName], rowIndex);
      if ('error' in coerced) {
        errors.push(coerced.error);
        continue;
      }
      if (coerced.value === undefined) {
        if (fieldDef.required && fieldDef.defaultValue === undefined) {
          errors.push({ row: rowIndex, field: fieldName, message: `Required field missing.` });
        }
        continue;
      }
      data[fieldName] = coerced.value;
    }

    // Flag any target keys in the source that aren't declared on the object.
    for (const sourceKey of Object.keys(raw)) {
      if (!def.fields[sourceKey] && sourceKey !== 'id') {
        errors.push({ row: rowIndex, field: sourceKey, message: `Unknown field — drop or remap it in the fieldMap.` });
      }
    }

    errorCount += errors.length;
    out.push({ row: rowIndex, data, errors });
  }

  return { rows: out, errorCount };
}

/**
 * Produce a preview without writing anything. Principals still need
 * `bulk` (or `create`) permission so the preview matches runtime access.
 */
export async function previewImport(
  type: string,
  opts: ImportParseOptions & { sampleSize?: number },
  ctx: ServiceContext,
): Promise<ImportPreview> {
  const def = objects[type];
  if (!def) throw new Error(`Unknown object: ${type}`);

  assertCan(ctx.actor, { object: { type, op: 'bulk' } });

  const fileErrors: string[] = [];
  let rows: Record<string, unknown>[] = [];
  let sourceFields: string[] = [];
  try {
    ({ rows, sourceFields } = parseImportContent(opts));
  } catch (err) {
    fileErrors.push(err instanceof Error ? err.message : 'Failed to parse import file.');
  }

  const fieldMap = opts.fieldMap ?? defaultFieldMap(sourceFields, def);
  const targetFields = Array.from(new Set(Object.values(fieldMap).filter((v) => v)));

  const mapped = rows.map((r) => applyFieldMap(r, fieldMap));
  const { rows: validated, errorCount } = validateImportRows(type, mapped);
  const sampleSize = opts.sampleSize ?? DEFAULT_SAMPLE_SIZE;

  return {
    targetFields,
    sourceFields,
    fieldMap,
    sampleRows: validated.slice(0, sampleSize),
    totalRows: rows.length,
    errorCount,
    fileErrors,
  };
}

/**
 * Execute the import. Rows with any errors are skipped — only error-free
 * rows are written. Returns a summary suitable for logging into a job row.
 */
export async function executeImport(
  type: string,
  opts: ImportParseOptions,
  ctx: ServiceContext,
): Promise<ImportResultSummary> {
  const def = objects[type];
  if (!def) throw new Error(`Unknown object: ${type}`);

  assertCan(ctx.actor, { object: { type, op: 'bulk' } });

  const { rows } = parseImportContent(opts);
  const fieldMap = opts.fieldMap ?? defaultFieldMap(Object.keys(rows[0] ?? {}), def);
  const mapped = rows.map((r) => applyFieldMap(r, fieldMap));
  const { rows: validated } = validateImportRows(type, mapped);

  const errors: ImportRowError[] = [];
  let created = 0;
  let failed = 0;

  for (const v of validated) {
    if (v.errors.length > 0) {
      errors.push(...v.errors);
      failed += 1;
      continue;
    }
    try {
      await objectCreate(type, v.data, ctx);
      created += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        row: v.row,
        message: err instanceof Error ? err.message : 'Create failed.',
      });
    }
  }

  return { created, failed, errors, totalRows: validated.length };
}

// --- CSV parser --------------------------------------------------------

/**
 * Minimal RFC-4180-compatible CSV parser. Handles quoted fields, escaped
 * double-quotes, CRLF, and trailing newlines. Throws on unbalanced quotes.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      if (field.length > 0) {
        throw new Error(`Unexpected quote at offset ${i}.`);
      }
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // swallow; handled by \n case
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (inQuotes) throw new Error('Unbalanced quote in CSV input.');
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  // drop trailing empty row created by a final newline
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') rows.pop();
  }
  return rows;
}
