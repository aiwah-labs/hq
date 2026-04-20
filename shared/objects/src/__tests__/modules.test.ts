import { describe, it, expect } from 'vitest';
import { objects } from '../registry.js';
import { moduleObjects } from '../modules/index.js';
import { crmObjects } from '../modules/crm.js';

describe('module convention', () => {
  it('crm module exports Customer + Product + Order', () => {
    expect(Object.keys(crmObjects).sort()).toEqual(['Customer', 'Order', 'Product']);
  });

  it('moduleObjects folds every module into one map', () => {
    for (const [key, def] of Object.entries(crmObjects)) {
      expect(moduleObjects[key]).toBe(def);
    }
  });

  it('root registry exposes module objects without duplication', () => {
    for (const key of Object.keys(moduleObjects)) {
      expect(objects[key]).toBeDefined();
    }
  });

  it('module objects include default permissions derived from their model', () => {
    const customer = moduleObjects.Customer;
    expect(customer).toBeDefined();
    expect(customer!.scopes.read).toBe('customer.read');
  });
});
