import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ActionRegistry } from '../registry.js';
import type { ActionDefinition } from '../types.js';

// Use a fresh ActionRegistry per test to avoid cross-test pollution
function makeRegistry() {
  return new ActionRegistry();
}

function makeAction(name: string, scopes: string[] = ['company.read'], overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    name,
    description: `Test action ${name}`,
    scopes,
    parameters: z.object({}),
    handler: async () => ({ ok: true }),
    ...overrides,
  };
}

// ── register / get / list ─────────────────────────────────────────────────────

describe('ActionRegistry.register', () => {
  it('registers and retrieves an action by name', () => {
    const reg = makeRegistry();
    const action = makeAction('test.do-thing');
    reg.register(action);
    expect(reg.get('test.do-thing')).toBe(action);
  });

  it('returns undefined for unregistered actions', () => {
    const reg = makeRegistry();
    expect(reg.get('not.registered')).toBeUndefined();
  });

  it('overwrites an existing action when re-registered with the same name', () => {
    const reg = makeRegistry();
    const a1 = makeAction('thing', [], { description: 'first' });
    const a2 = makeAction('thing', [], { description: 'second' });
    reg.register(a1);
    reg.register(a2);
    expect(reg.get('thing')?.description).toBe('second');
  });
});

describe('ActionRegistry.list', () => {
  it('returns empty array when nothing registered', () => {
    const reg = makeRegistry();
    expect(reg.list()).toEqual([]);
  });

  it('returns all registered actions', () => {
    const reg = makeRegistry();
    reg.register(makeAction('a.one'));
    reg.register(makeAction('a.two'));
    reg.register(makeAction('a.three'));
    expect(reg.list()).toHaveLength(3);
  });
});

// ── resolve (scope filtering) ─────────────────────────────────────────────────

describe('ActionRegistry.resolve', () => {
  it('returns actions whose scopes intersect with granted scopes', () => {
    const reg = makeRegistry();
    reg.register(makeAction('company.read-action', ['company.read']));
    reg.register(makeAction('contact.read-action', ['contact.read']));
    reg.register(makeAction('note.write-action', ['note.write']));

    const accessible = reg.resolve(['company.read', 'note.write']);
    const names = accessible.map((a) => a.name);
    expect(names).toContain('company.read-action');
    expect(names).toContain('note.write-action');
    expect(names).not.toContain('contact.read-action');
  });

  it('returns empty array when no scopes granted', () => {
    const reg = makeRegistry();
    reg.register(makeAction('company.list', ['company.read']));
    expect(reg.resolve([])).toEqual([]);
  });

  it('returns all actions when wildcard-like full scope set granted', () => {
    const reg = makeRegistry();
    reg.register(makeAction('a', ['company.read']));
    reg.register(makeAction('b', ['contact.write']));
    const result = reg.resolve(['company.read', 'contact.write']);
    expect(result).toHaveLength(2);
  });

  it('handles actions with multiple scopes — accessible if any scope matches', () => {
    const reg = makeRegistry();
    reg.register(makeAction('multi', ['company.read', 'company.write']));
    // Granted only read — should still be accessible
    expect(reg.resolve(['company.read'])).toHaveLength(1);
  });

  it('does not include an action with zero matching scopes', () => {
    const reg = makeRegistry();
    reg.register(makeAction('secret-action', ['admin.super-special']));
    expect(reg.resolve(['company.read'])).toHaveLength(0);
  });
});

// ── action handler invocation ─────────────────────────────────────────────────

describe('ActionRegistry — action handler', () => {
  it('can call the handler directly with params', async () => {
    const reg = makeRegistry();
    const handler = async (params: unknown) => ({ received: params });
    reg.register({
      name: 'test.echo',
      description: 'echo',
      scopes: ['company.read'],
      parameters: z.object({ msg: z.string() }),
      handler,
    });

    const action = reg.get('test.echo')!;
    const result = await action.handler({ msg: 'hello' }, {} as any);
    expect(result).toEqual({ received: { msg: 'hello' } });
  });
});

// ── parameter schema ──────────────────────────────────────────────────────────

describe('ActionRegistry — parameter validation', () => {
  it('stores zod schema in parameters field', () => {
    const reg = makeRegistry();
    const schema = z.object({ id: z.string() });
    reg.register(makeAction('test.schema', [], { parameters: schema }));

    const action = reg.get('test.schema')!;
    // Valid input
    const valid = action.parameters.safeParse({ id: 'abc' });
    expect(valid.success).toBe(true);

    // Invalid input
    const invalid = action.parameters.safeParse({ id: 123 });
    expect(invalid.success).toBe(false);
  });
});
