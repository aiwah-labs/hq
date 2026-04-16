import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock @hq/objects to prevent DB imports
vi.mock('@hq/objects', () => ({
  objects: {},
  objectList: vi.fn(),
  objectGet: vi.fn(),
  objectCreate: vi.fn(),
  objectUpdate: vi.fn(),
  objectDelete: vi.fn(),
  objectBulkUpdate: vi.fn(),
  objectBulkDelete: vi.fn(),
  objectCount: vi.fn(),
}));

const { actionRegistry, defineAction } = await import('../registry.js');

describe('defineAction', () => {
  it('registers the action in the singleton registry', () => {
    const action = defineAction({
      name: 'test.custom-action',
      description: 'A custom action',
      scopes: ['company.read'],
      parameters: z.object({ id: z.string() }),
      handler: async () => ({ ok: true }),
    });

    expect(actionRegistry.get('test.custom-action')).toBe(action);
  });

  it('returns the action definition', () => {
    const action = defineAction({
      name: 'test.returns',
      description: 'Returns itself',
      scopes: ['company.read'],
      parameters: z.object({}),
      handler: async () => 'result',
    });

    expect(action.name).toBe('test.returns');
    expect(action.description).toBe('Returns itself');
  });
});

describe('ActionRegistry.registerObjectCrud', () => {
  it('registers CRUD actions for objects in the registry', async () => {
    const { objects } = await import('@hq/objects');

    // Inject a test object
    (objects as any)['TestObj'] = {
      model: 'TestObj',
      scopes: { read: 'testobj.read', write: 'testobj.write', delete: 'testobj.delete' },
      events: false,
      label: 'Test Object',
      pluralLabel: 'Test Objects',
      fields: {
        name: { type: 'string', required: true, label: 'Name' },
      },
    };

    // Use a fresh registry to avoid conflicts
    const { ActionRegistry } = await import('../registry.js');
    const reg = new ActionRegistry();
    reg.registerObjectCrud();

    expect(reg.get('testobj.list')).toBeDefined();
    expect(reg.get('testobj.get')).toBeDefined();
    expect(reg.get('testobj.create')).toBeDefined();
    expect(reg.get('testobj.update')).toBeDefined();
    expect(reg.get('testobj.delete')).toBeDefined();
    expect(reg.get('testobj.count')).toBeDefined();
    expect(reg.get('testobj.bulkUpdate')).toBeDefined();
    expect(reg.get('testobj.bulkDelete')).toBeDefined();

    // Verify scopes
    expect(reg.get('testobj.list')!.scopes).toContain('testobj.read');
    expect(reg.get('testobj.create')!.scopes).toContain('testobj.write');
    expect(reg.get('testobj.delete')!.scopes).toContain('testobj.delete');

    // Verify category
    expect(reg.get('testobj.list')!.category).toBe('crud');

    // Clean up
    delete (objects as any)['TestObj'];
  });

  it('crud handlers delegate to the correct object functions', async () => {
    const { objects, objectList, objectGet, objectCreate, objectUpdate, objectDelete, objectBulkUpdate, objectBulkDelete, objectCount } = await import('@hq/objects');

    (objects as any)['CrudTest'] = {
      model: 'CrudTest',
      scopes: { read: 'crudtest.read', write: 'crudtest.write', delete: 'crudtest.delete' },
      events: false,
      label: 'Crud Test',
      pluralLabel: 'Crud Tests',
      fields: { name: { type: 'string', required: true, label: 'Name' } },
    };

    const { ActionRegistry } = await import('../registry.js');
    const reg = new ActionRegistry();
    reg.registerObjectCrud();

    const fakeCtx = {} as any;

    // Test list handler
    vi.mocked(objectList).mockResolvedValue({ items: [], nextCursor: null });
    await reg.get('crudtest.list')!.handler({ limit: 10 }, fakeCtx);
    expect(objectList).toHaveBeenCalledWith('CrudTest', { limit: 10 }, fakeCtx);

    // Test count handler
    vi.mocked(objectCount).mockResolvedValue(5);
    await reg.get('crudtest.count')!.handler({}, fakeCtx);
    expect(objectCount).toHaveBeenCalledWith('CrudTest', {}, fakeCtx);

    // Test get handler
    vi.mocked(objectGet).mockResolvedValue({ id: 'x' });
    await reg.get('crudtest.get')!.handler({ id: 'x' }, fakeCtx);
    expect(objectGet).toHaveBeenCalledWith('CrudTest', 'x', fakeCtx);

    // Test create handler
    vi.mocked(objectCreate).mockResolvedValue({ id: 'new' });
    await reg.get('crudtest.create')!.handler({ name: 'New' }, fakeCtx);
    expect(objectCreate).toHaveBeenCalledWith('CrudTest', { name: 'New' }, fakeCtx);

    // Test update handler
    vi.mocked(objectUpdate).mockResolvedValue({ id: 'x' });
    await reg.get('crudtest.update')!.handler({ id: 'x', name: 'Updated' }, fakeCtx);
    expect(objectUpdate).toHaveBeenCalledWith('CrudTest', 'x', { name: 'Updated' }, fakeCtx);

    // Test delete handler
    vi.mocked(objectDelete).mockResolvedValue(undefined);
    const delResult = await reg.get('crudtest.delete')!.handler({ id: 'x' }, fakeCtx);
    expect(objectDelete).toHaveBeenCalledWith('CrudTest', 'x', fakeCtx);
    expect(delResult).toEqual({ success: true });

    // Test bulkUpdate handler
    vi.mocked(objectBulkUpdate).mockResolvedValue([{ id: 'x', ok: true }]);
    await reg.get('crudtest.bulkUpdate')!.handler({ updates: [{ id: 'x', name: 'B' }] }, fakeCtx);
    expect(objectBulkUpdate).toHaveBeenCalled();

    // Test bulkDelete handler
    vi.mocked(objectBulkDelete).mockResolvedValue({ deleted: 1 });
    await reg.get('crudtest.bulkDelete')!.handler({ ids: ['x'] }, fakeCtx);
    expect(objectBulkDelete).toHaveBeenCalled();

    delete (objects as any)['CrudTest'];
  });
});
