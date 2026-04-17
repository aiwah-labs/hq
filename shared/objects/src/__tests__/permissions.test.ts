import { describe, it, expect } from 'vitest';
import { resolveObjectPermissions, getObjectOwnership } from '../permissions.js';
import type { ObjectDefinition } from '../types.js';

function makeDef(overrides: Partial<ObjectDefinition> = {}): ObjectDefinition {
  return {
    model: 'Task',
    label: 'Task',
    pluralLabel: 'Tasks',
    scopes: { read: 'task.read', write: 'task.write' },
    fields: {},
    ...overrides,
  };
}

describe('resolveObjectPermissions', () => {
  it('derives `{model}.{op}` defaults from a lower-cased model name', () => {
    const keys = resolveObjectPermissions(makeDef());
    expect(keys).toEqual({
      read: 'task.read',
      create: 'task.create',
      update: 'task.update',
      delete: 'task.delete',
      bulk: 'task.bulk',
    });
  });

  it('respects per-object overrides', () => {
    const keys = resolveObjectPermissions(
      makeDef({
        permissions: { read: 'crm.read', update: 'crm.write' },
      }),
    );
    expect(keys.read).toBe('crm.read');
    expect(keys.update).toBe('crm.write');
    // Non-overridden keys still default.
    expect(keys.create).toBe('task.create');
    expect(keys.delete).toBe('task.delete');
    expect(keys.bulk).toBe('task.bulk');
  });

  it('lower-cases multi-word model names for defaults', () => {
    const keys = resolveObjectPermissions(makeDef({ model: 'InvoiceLine' }));
    expect(keys.read).toBe('invoiceline.read');
  });
});

describe('getObjectOwnership', () => {
  it('returns undefined when no ownership configured', () => {
    expect(getObjectOwnership(makeDef())).toBeUndefined();
  });

  it('returns the configured ownership shape', () => {
    const ownership = getObjectOwnership(
      makeDef({
        ownership: { ownerField: 'ownerUserId', assigneeField: 'assigneeUserId' },
      }),
    );
    expect(ownership).toEqual({ ownerField: 'ownerUserId', assigneeField: 'assigneeUserId' });
  });
});
