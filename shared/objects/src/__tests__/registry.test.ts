import { describe, it, expect } from 'vitest';
import { objects } from '../registry.js';
import type { ObjectDefinition } from '../types.js';

describe('Object Registry', () => {
  const objectNames = Object.keys(objects);

  it('has at least one object definition', () => {
    expect(objectNames.length).toBeGreaterThanOrEqual(1);
  });

  it('includes the seeded example objects', () => {
    expect(objectNames).toContain('Customer');
    expect(objectNames).toContain('Product');
  });

  for (const [name, def] of Object.entries(objects)) {
    describe(`${name}`, () => {
      it('has a model name', () => {
        expect(def.model).toBeTruthy();
      });

      it('has read and write scopes', () => {
        expect(def.scopes.read).toBeTruthy();
        expect(def.scopes.write).toBeTruthy();
      });

      it('has label and pluralLabel', () => {
        expect(def.label).toBeTruthy();
        expect(def.pluralLabel).toBeTruthy();
      });

      it('has at least one field', () => {
        expect(Object.keys(def.fields).length).toBeGreaterThan(0);
      });

      it('all fields have a type and label', () => {
        for (const [key, field] of Object.entries(def.fields)) {
          expect(field.type).toBeTruthy();
          expect(field.label).toBeTruthy();
        }
      });

      it('relation fields have target and kind', () => {
        for (const [key, field] of Object.entries(def.fields)) {
          if (field.type === 'relation') {
            expect(field.target).toBeTruthy();
            expect(field.kind).toBeTruthy();
          }
        }
      });

      it('enum fields have values array', () => {
        for (const [key, field] of Object.entries(def.fields)) {
          if (field.type === 'enum') {
            expect(Array.isArray(field.values)).toBe(true);
            expect(field.values!.length).toBeGreaterThan(0);
          }
        }
      });

      it('belongsTo relations have foreignKey', () => {
        for (const [key, field] of Object.entries(def.fields)) {
          if (field.type === 'relation' && field.kind === 'belongsTo') {
            expect(field.foreignKey).toBeTruthy();
          }
        }
      });
    });
  }
});
