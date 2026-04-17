import { describe, it, expect } from 'vitest';
import { objects } from '../registry.js';
import { moduleObjects } from '../modules/index.js';
import { crmObjects } from '../modules/crm.js';

describe('module convention', () => {
  it('crm module exports Customer + Product', () => {
    expect(Object.keys(crmObjects).sort()).toEqual(['Customer', 'Product']);
  });

  it('moduleObjects folds every module into one map', () => {
    // Every crm entry should be present in the combined module map.
    for (const [key, def] of Object.entries(crmObjects)) {
      expect(moduleObjects[key]).toBe(def);
    }
  });

  it('root registry exposes module objects without duplication', () => {
    // The registry must be a strict superset of moduleObjects.
    for (const key of Object.keys(moduleObjects)) {
      expect(objects[key]).toBeDefined();
    }
  });

  it('module objects include default permissions derived from their model', () => {
    const customer = moduleObjects.Customer;
    expect(customer).toBeDefined();
    // Default lower-cased model name drives permission key derivation, but the
    // definition itself only needs `scopes` — the runtime computes keys.
    expect(customer!.scopes.read).toBe('customer.read');
  });
});
