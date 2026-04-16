import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { listParamsSchema, deriveCreateSchema, deriveUpdateSchema } from '../schema.js';
import type { ObjectDefinition } from '@hq/objects';

// ── listParamsSchema ─────────────────────────────────────────────────────────

describe('listParamsSchema', () => {
  it('accepts empty input with defaults', () => {
    const result = listParamsSchema.parse({});
    expect(result.limit).toBe(50);
  });

  it('accepts all valid params', () => {
    const result = listParamsSchema.parse({
      q: 'search',
      filters: { country: 'US' },
      sortBy: 'name',
      sortDir: 'asc',
      limit: 10,
      cursor: 'abc123',
      include: ['contacts'],
    });
    expect(result.q).toBe('search');
    expect(result.sortDir).toBe('asc');
    expect(result.limit).toBe(10);
  });

  it('coerces string limit to number', () => {
    const result = listParamsSchema.parse({ limit: '25' });
    expect(result.limit).toBe(25);
  });

  it('rejects limit below 1', () => {
    expect(() => listParamsSchema.parse({ limit: 0 })).toThrow();
  });

  it('rejects limit above 200', () => {
    expect(() => listParamsSchema.parse({ limit: 201 })).toThrow();
  });

  it('rejects invalid sortDir', () => {
    expect(() => listParamsSchema.parse({ sortDir: 'up' })).toThrow();
  });
});

// ── deriveCreateSchema ───────────────────────────────────────────────────────

const testDef: ObjectDefinition = {
  model: 'TestModel',
  scopes: { read: 'test.read', write: 'test.write' },
  events: false,
  label: 'Test',
  pluralLabel: 'Tests',
  fields: {
    name: { type: 'string', label: 'Name', required: true },
    description: { type: 'text', label: 'Description' },
    count: { type: 'number', label: 'Count' },
    active: { type: 'boolean', label: 'Active' },
    createdAt: { type: 'date', label: 'Created At' },
    status: { type: 'enum', values: ['DRAFT', 'ACTIVE', 'ARCHIVED'], label: 'Status' },
    metadata: { type: 'json', label: 'Metadata' },
    parent: { type: 'relation', target: 'Parent', kind: 'belongsTo', label: 'Parent' },
  },
};

describe('deriveCreateSchema', () => {
  const schema = deriveCreateSchema(testDef);

  it('returns a zod object schema', () => {
    expect(schema).toBeInstanceOf(z.ZodObject);
  });

  it('requires required fields', () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts valid input with required fields', () => {
    const result = schema.safeParse({ name: 'Test Item' });
    expect(result.success).toBe(true);
  });

  it('accepts all field types', () => {
    const result = schema.safeParse({
      name: 'Test',
      description: 'Some text',
      count: 42,
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      status: 'DRAFT',
      metadata: { key: 'value' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid enum values', () => {
    const result = schema.safeParse({ name: 'Test', status: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('skips relation fields', () => {
    // 'parent' is a relation field — should not appear in schema
    const result = schema.safeParse({ name: 'Test', parent: 'some-id' });
    // Should still pass — extra keys are stripped by zod
    expect(result.success).toBe(true);
  });

  it('trims string fields', () => {
    const result = schema.parse({ name: '  padded  ' });
    expect(result.name).toBe('padded');
  });

  it('makes optional fields truly optional', () => {
    const result = schema.safeParse({ name: 'Only Required' });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('description');
  });
});

// ── deriveUpdateSchema ───────────────────────────────────────────────────────

describe('deriveUpdateSchema', () => {
  const schema = deriveUpdateSchema(testDef);

  it('makes all fields optional (including previously required)', () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial updates', () => {
    const result = schema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('Updated Name');
  });

  it('still validates types on provided fields', () => {
    const result = schema.safeParse({ count: 'not-a-number' });
    expect(result.success).toBe(false);
  });
});
