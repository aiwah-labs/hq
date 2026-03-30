import { describe, it, expect } from 'vitest';
import { resolveExpression, resolveInputMap, evaluateCondition } from '../expression.js';
import type { WorkflowExecutionContext } from '../types.js';

// ── Fixture factory ───────────────────────────────────────────────────────────

function ctx(overrides: Partial<WorkflowExecutionContext> = {}): WorkflowExecutionContext {
  return {
    workflowKey: 'test.workflow',
    runId: 'run_1',
    input: {},
    steps: {},
    variables: {},
    triggerPayload: {},
    loop: undefined,
    serviceContext: {} as never,
    ...overrides,
  };
}

// ── Plain strings (no template syntax) ───────────────────────────────────────

describe('resolveExpression — plain strings', () => {
  it('returns the string unchanged when no {{ present', () => {
    expect(resolveExpression('hello world', ctx())).toBe('hello world');
  });

  it('returns empty string unchanged', () => {
    expect(resolveExpression('', ctx())).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveExpression('  plain  ', ctx())).toBe('plain');
  });
});

// ── Single expression — raw value passthrough ─────────────────────────────────

describe('resolveExpression — single raw expression', () => {
  it('returns a string value', () => {
    expect(resolveExpression('{{input.name}}', ctx({ input: { name: 'Acme' } }))).toBe('Acme');
  });

  it('returns a number value (not stringified)', () => {
    expect(resolveExpression('{{input.count}}', ctx({ input: { count: 42 } }))).toBe(42);
  });

  it('returns a boolean value', () => {
    expect(resolveExpression('{{input.active}}', ctx({ input: { active: true } }))).toBe(true);
  });

  it('returns an object value unchanged', () => {
    const obj = { score: 87, verdict: 'strong' };
    expect(resolveExpression('{{steps.score.output}}', ctx({
      steps: { score: { output: obj } }
    }))).toBe(obj);
  });

  it('returns null for missing path', () => {
    expect(resolveExpression('{{input.missing}}', ctx({ input: {} }))).toBeUndefined();
  });

  it('resolves nested paths', () => {
    expect(resolveExpression('{{steps.fetch.output.text}}', ctx({
      steps: { fetch: { output: { text: 'hello content' } } }
    }))).toBe('hello content');
  });

  it('resolves trigger payload', () => {
    expect(resolveExpression('{{trigger.objectId}}', ctx({
      triggerPayload: { objectId: 'cmp_123' }
    }))).toBe('cmp_123');
  });

  it('resolves loop.item', () => {
    expect(resolveExpression('{{loop.item}}', ctx({
      loop: { item: 'value', index: 0 }
    }))).toBe('value');
  });

  it('resolves loop.index', () => {
    expect(resolveExpression('{{loop.index}}', ctx({
      loop: { item: 'v', index: 5 }
    }))).toBe(5);
  });
});

// ── Template interpolation ────────────────────────────────────────────────────

describe('resolveExpression — template interpolation', () => {
  it('interpolates a single expression with surrounding text', () => {
    expect(resolveExpression('Hello {{input.name}}!', ctx({ input: { name: 'Acme' } }))).toBe('Hello Acme!');
  });

  it('interpolates multiple expressions', () => {
    expect(resolveExpression('{{input.first}} {{input.last}}', ctx({
      input: { first: 'John', last: 'Doe' }
    }))).toBe('John Doe');
  });

  it('replaces missing path with empty string in template', () => {
    expect(resolveExpression('Hello {{input.missing}}!', ctx({ input: {} }))).toBe('Hello !');
  });

  it('JSON-stringifies objects in template context', () => {
    const result = resolveExpression('Data: {{input.obj}}', ctx({ input: { obj: { a: 1 } } }));
    expect(result).toBe('Data: {"a":1}');
  });

  it('handles numbers in template context', () => {
    expect(resolveExpression('Score: {{input.score}}', ctx({ input: { score: 95 } }))).toBe('Score: 95');
  });

  it('handles booleans in template context', () => {
    expect(resolveExpression('Active: {{input.active}}', ctx({ input: { active: false } }))).toBe('Active: false');
  });
});

// ── Env resolution ────────────────────────────────────────────────────────────

describe('resolveExpression — env vars', () => {
  it('resolves NODE_ENV', () => {
    process.env.NODE_ENV = 'test';
    expect(resolveExpression('{{env.NODE_ENV}}', ctx())).toBe('test');
  });

  it('does not expose arbitrary env vars', () => {
    process.env.SECRET_KEY = 'super-secret';
    // ALLOWED_ENV_KEYS only includes NODE_ENV
    expect(resolveExpression('{{env.SECRET_KEY}}', ctx())).toBeUndefined();
  });
});

// ── resolveInputMap ───────────────────────────────────────────────────────────

describe('resolveInputMap', () => {
  it('resolves all keys in the map', () => {
    const result = resolveInputMap({
      companyId: '{{input.id}}',
      name: '{{input.name}}',
    }, ctx({ input: { id: 'c1', name: 'Acme' } }));
    expect(result).toEqual({ companyId: 'c1', name: 'Acme' });
  });

  it('preserves literal values without {{ markers', () => {
    const result = resolveInputMap({ maxResults: '10' }, ctx());
    expect(result).toEqual({ maxResults: '10' });
  });

  it('returns empty object for empty inputMap', () => {
    expect(resolveInputMap({}, ctx())).toEqual({});
  });
});

// ── evaluateCondition ─────────────────────────────────────────────────────────

describe('evaluateCondition', () => {
  it('returns true for a truthy string value', () => {
    expect(evaluateCondition('{{input.text}}', ctx({ input: { text: 'hello' } }))).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(evaluateCondition('{{input.missing}}', ctx({ input: {} }))).toBe(false);
  });

  it('returns false for null', () => {
    expect(evaluateCondition('{{steps.fetch.output.text}}', ctx({
      steps: { fetch: { output: { text: null } } }
    }))).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(evaluateCondition('{{input.text}}', ctx({ input: { text: '' } }))).toBe(false);
  });

  it('returns true for a number', () => {
    expect(evaluateCondition('{{input.count}}', ctx({ input: { count: 1 } }))).toBe(true);
  });

  it('returns false for zero', () => {
    expect(evaluateCondition('{{input.count}}', ctx({ input: { count: 0 } }))).toBe(false);
  });

  it('returns true for a non-empty array', () => {
    expect(evaluateCondition('{{input.items}}', ctx({ input: { items: [1, 2] } }))).toBe(true);
  });

  it('returns true for an object', () => {
    expect(evaluateCondition('{{input.obj}}', ctx({ input: { obj: { a: 1 } } }))).toBe(true);
  });

  it('evaluates a plain truthy literal', () => {
    expect(evaluateCondition('some literal text', ctx())).toBe(true);
  });

  it('evaluates empty string as false', () => {
    expect(evaluateCondition('', ctx())).toBe(false);
  });
});
