import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowDefinition, NodeDef, EdgeDef } from '../types.js';

// Use a fresh module for each test to avoid polluting the registry
// We can't easily reset the module-level Map, so we test via the public API
const { defineWorkflow, getWorkflow, getWorkflows, serializeWorkflowDef } = await import('../registry.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

let idCounter = 0;

function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  const key = overrides.key ?? `test.wf-${++idCounter}`;
  return {
    key,
    name: key,
    description: 'Test workflow',
    version: 1,
    triggers: [{ type: 'manual' }],
    nodes: [
      { id: 'step1', type: 'function', annotation: { label: 'Step 1' }, handler: async () => 'ok' },
    ],
    edges: [],
    entryNodeId: 'step1',
    ...overrides,
  };
}

// ── defineWorkflow ───────────────────────────────────────────────────────────

describe('defineWorkflow', () => {
  it('registers and retrieves a workflow by key', () => {
    const def = makeWorkflow();
    defineWorkflow(def);
    expect(getWorkflow(def.key)).toBe(def);
  });

  it('throws on duplicate key', () => {
    const key = `dup-${++idCounter}`;
    defineWorkflow(makeWorkflow({ key }));
    expect(() => defineWorkflow(makeWorkflow({ key }))).toThrow('Duplicate workflow key');
  });

  it('throws when entryNodeId is not in nodes', () => {
    expect(() => defineWorkflow(makeWorkflow({
      key: `bad-entry-${++idCounter}`,
      entryNodeId: 'nonexistent',
    }))).toThrow('entryNodeId');
  });

  it('throws when edge references unknown source node', () => {
    expect(() => defineWorkflow(makeWorkflow({
      key: `bad-edge-src-${++idCounter}`,
      edges: [{ from: 'missing', to: 'step1' }],
    }))).toThrow('unknown source node');
  });

  it('throws when edge references unknown target node', () => {
    expect(() => defineWorkflow(makeWorkflow({
      key: `bad-edge-tgt-${++idCounter}`,
      edges: [{ from: 'step1', to: 'missing' }],
    }))).toThrow('unknown target node');
  });

  it('throws when parallel branch references unknown node', () => {
    expect(() => defineWorkflow(makeWorkflow({
      key: `bad-parallel-${++idCounter}`,
      nodes: [
        { id: 'p', type: 'parallel', annotation: { label: 'P' }, branches: ['missing'] },
      ],
      entryNodeId: 'p',
    }))).toThrow('unknown branch');
  });

  it('throws when loop bodyNodeId references unknown node', () => {
    expect(() => defineWorkflow(makeWorkflow({
      key: `bad-loop-${++idCounter}`,
      nodes: [
        { id: 'loop', type: 'loop', annotation: { label: 'L' }, itemsExpression: '{{input.items}}', bodyNodeId: 'missing' },
      ],
      entryNodeId: 'loop',
    }))).toThrow('unknown body node');
  });

  it('throws when eval references unknown node', () => {
    expect(() => defineWorkflow(makeWorkflow({
      key: `bad-eval-${++idCounter}`,
      evals: { 'nonexistent': async () => [] },
    }))).toThrow('unknown node');
  });

  it('accepts a valid multi-node workflow', () => {
    const def = makeWorkflow({
      key: `valid-multi-${++idCounter}`,
      nodes: [
        { id: 'a', type: 'function', annotation: { label: 'A' }, handler: async () => 1 },
        { id: 'b', type: 'function', annotation: { label: 'B' }, handler: async () => 2 },
      ],
      edges: [{ from: 'a', to: 'b' }],
      entryNodeId: 'a',
    });
    expect(() => defineWorkflow(def)).not.toThrow();
  });
});

// ── getWorkflows ─────────────────────────────────────────────────────────────

describe('getWorkflows', () => {
  it('returns an array of all registered workflows', () => {
    const workflows = getWorkflows();
    expect(Array.isArray(workflows)).toBe(true);
    expect(workflows.length).toBeGreaterThan(0);
  });
});

// ── serializeWorkflowDef ─────────────────────────────────────────────────────

describe('serializeWorkflowDef', () => {
  it('strips handler functions from nodes', () => {
    const def = makeWorkflow({
      key: `serialize-${++idCounter}`,
      nodes: [
        { id: 'fn', type: 'function', annotation: { label: 'Fn' }, handler: async () => 'secret' },
      ],
      entryNodeId: 'fn',
    });
    defineWorkflow(def);

    const serialized = serializeWorkflowDef(def);
    const node = serialized.nodes.find((n) => n.id === 'fn')!;
    expect(node).toBeDefined();
    expect('handler' in node).toBe(false);
  });

  it('preserves action node metadata', () => {
    const def = makeWorkflow({
      key: `serialize-action-${++idCounter}`,
      nodes: [
        { id: 'act', type: 'action', annotation: { label: 'Act' }, actionName: 'company.get', inputMap: { id: '{{input.id}}' } },
      ],
      entryNodeId: 'act',
    });
    defineWorkflow(def);

    const serialized = serializeWorkflowDef(def);
    const node = serialized.nodes.find((n) => n.id === 'act')!;
    expect(node.actionName).toBe('company.get');
  });

  it('includes parallel branches info', () => {
    const def = makeWorkflow({
      key: `serialize-parallel-${++idCounter}`,
      nodes: [
        { id: 'p', type: 'parallel', annotation: { label: 'P' }, branches: ['a', 'b'] },
        { id: 'a', type: 'function', annotation: { label: 'A' }, handler: async () => 1 },
        { id: 'b', type: 'function', annotation: { label: 'B' }, handler: async () => 2 },
      ],
      edges: [{ from: 'p', to: 'a' }, { from: 'p', to: 'b' }],
      entryNodeId: 'p',
    });
    defineWorkflow(def);

    const serialized = serializeWorkflowDef(def);
    const node = serialized.nodes.find((n) => n.id === 'p')!;
    expect(node.branches).toEqual(['a', 'b']);
  });

  it('reports whether input is required', async () => {
    const { z } = await import('zod');
    const def = makeWorkflow({
      key: `serialize-input-${++idCounter}`,
      inputSchema: z.object({ id: z.string() }),
    });
    defineWorkflow(def);

    const serialized = serializeWorkflowDef(def);
    expect(serialized.requiresInput).toBe(true);
  });

  it('lists eval node IDs', () => {
    const evalFn = async () => [];
    const def = makeWorkflow({
      key: `serialize-evals-${++idCounter}`,
      evals: { 'step1': evalFn },
    });
    defineWorkflow(def);

    const serialized = serializeWorkflowDef(def);
    expect(serialized.hasEvals).toEqual(['step1']);
  });
});
