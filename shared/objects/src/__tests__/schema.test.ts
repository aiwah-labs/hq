import { describe, it, expect, vi } from 'vitest';
import type { ObjectDefinition } from '../types.js';

// Mock the registry with a deterministic object set.
vi.mock('../registry.js', () => {
  const testObjects: Record<string, ObjectDefinition> = {
    Widget: {
      model: 'Widget',
      label: 'Widget',
      pluralLabel: 'Widgets',
      displayField: 'name',
      scopes: { read: 'widget.read', write: 'widget.write', delete: 'widget.delete' },
      events: true,
      fields: {
        name: {
          type: 'string',
          label: 'Name',
          required: true,
          order: 10,
          placeholder: 'New Widget',
          display: true,
        },
        notes: {
          type: 'text',
          label: 'Notes',
          order: 20,
          format: 'textarea',
          list: { show: false },
        },
        status: {
          type: 'enum',
          label: 'Status',
          values: ['ON', 'OFF'],
          filterable: true,
          order: 15,
        },
        secret: {
          type: 'string',
          label: 'Secret',
          hidden: true,
          order: 5,
        },
        internalId: {
          type: 'string',
          label: 'Internal ID',
          readonly: true,
          order: 25,
        },
        owner: {
          type: 'relation',
          target: 'User',
          kind: 'belongsTo',
          foreignKey: 'ownerId',
          label: 'Owner',
          order: 30,
        },
        items: {
          type: 'relation',
          target: 'Item',
          kind: 'hasMany',
          label: 'Items',
          order: 40,
        },
      },
    },
  };
  return { objects: testObjects };
});

const {
  getObjectSchema,
  listObjectSchemas,
  serializeField,
  serializeObject,
  getListFields,
  getFormFields,
  getDetailFields,
} = await import('../schema.js');
const { objects } = await import('../registry.js');
const def = objects.Widget!;

describe('serializeField', () => {
  it('serializes label and type and omits undefined keys', () => {
    const out = serializeField('name', def.fields.name!);
    expect(out.name).toBe('name');
    expect(out.type).toBe('string');
    expect(out.label).toBe('Name');
    expect(out.required).toBe(true);
    expect((out as Record<string, unknown>).description).toBeUndefined();
  });

  it('preserves all metadata fields when present', () => {
    const out = serializeField('notes', def.fields.notes!);
    expect(out.format).toBe('textarea');
    expect(out.list).toEqual({ show: false });
  });

  it('preserves relation metadata', () => {
    const out = serializeField('owner', def.fields.owner!);
    expect(out.target).toBe('User');
    expect(out.kind).toBe('belongsTo');
    expect(out.foreignKey).toBe('ownerId');
  });
});

describe('serializeObject', () => {
  it('returns JSON-safe payload with ordered fields', () => {
    const out = serializeObject('Widget', def);
    expect(out.type).toBe('Widget');
    expect(out.label).toBe('Widget');
    expect(out.pluralLabel).toBe('Widgets');
    expect(out.scopes.read).toBe('widget.read');
    expect(out.fields.map((f) => f.name)).toEqual([
      'secret',
      'name',
      'status',
      'notes',
      'internalId',
      'owner',
      'items',
    ]);
    // Ensure JSON-safe
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});

describe('getObjectSchema / listObjectSchemas', () => {
  it('returns the schema for a known type', () => {
    expect(getObjectSchema('Widget')?.type).toBe('Widget');
  });

  it('returns null for unknown types', () => {
    expect(getObjectSchema('Unknown')).toBeNull();
  });

  it('lists every registered schema', () => {
    const all = listObjectSchemas();
    expect(all.map((o) => o.type)).toEqual(['Widget']);
  });
});

describe('getListFields', () => {
  it('excludes hasMany relations and fields with list.show=false', () => {
    const names = getListFields(def).map(([n]) => n);
    expect(names).not.toContain('notes');
    expect(names).not.toContain('items');
    expect(names).toContain('name');
    expect(names).toContain('status');
  });

  it('excludes hidden fields', () => {
    const names = getListFields(def).map(([n]) => n);
    expect(names).not.toContain('secret');
  });
});

describe('getFormFields', () => {
  it('excludes readonly, relation, and hidden fields', () => {
    const names = getFormFields(def).map(([n]) => n);
    expect(names).not.toContain('internalId');
    expect(names).not.toContain('owner');
    expect(names).not.toContain('items');
    expect(names).not.toContain('secret');
  });

  it('respects field order', () => {
    const names = getFormFields(def).map(([n]) => n);
    expect(names).toEqual(['name', 'status', 'notes']);
  });
});

describe('getDetailFields', () => {
  it('includes every non-hidden field in order', () => {
    const names = getDetailFields(def).map(([n]) => n);
    // secret is hidden; everything else visible
    expect(names).toEqual(['name', 'status', 'notes', 'internalId', 'owner', 'items']);
  });
});
