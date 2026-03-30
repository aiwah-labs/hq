import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowDefinition, NodeDef, EdgeDef, ServiceContext } from '../types.js';

// ── Mocks — set up before importing the executor ──────────────────────────────

vi.mock('../persistence.js', () => {
  let runIdCounter = 0;
  let stepIdCounter = 0;
  return {
    createRun: vi.fn().mockImplementation(async () => ({ id: `run_${++runIdCounter}` })),
    updateRunStatus: vi.fn().mockResolvedValue(undefined),
    createStepLog: vi.fn().mockImplementation(async () => ({ id: `step_${++stepIdCounter}` })),
    updateStepLog: vi.fn().mockResolvedValue(undefined),
    updateStepInput: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@hq/events', () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

// Action registry mock — returns actions we register per-test
const actionHandlers = new Map<string, (params: unknown) => Promise<unknown>>();

// Passthrough zod-like schema: accepts any input without validation
const passthroughSchema = {
  safeParse: (v: unknown) => ({ success: true as const, data: v }),
};

vi.mock('@hq/actions', () => ({
  actionRegistry: {
    get: vi.fn().mockImplementation((name: string) => {
      const handler = actionHandlers.get(name);
      return handler ? { name, handler, parameters: passthroughSchema } : undefined;
    }),
  },
}));

// Registry mock — returns workflow we set per-test
const workflowRegistry = new Map<string, WorkflowDefinition>();

vi.mock('../registry.js', () => ({
  getWorkflow: vi.fn().mockImplementation((key: string) => workflowRegistry.get(key)),
}));

// Now import the executor (after mocks are set)
const { executeWorkflow } = await import('../executor.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockServiceContext: ServiceContext = {
  actor: { kind: 'agent', source: 'internal', agentKey: 'test', agentName: 'Test', scopes: [], permissions: {} as never },
  dbClient: {} as never,
  now: () => new Date(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
};

function buildWorkflow(
  key: string,
  nodes: NodeDef[],
  edges: EdgeDef[],
  entryNodeId: string,
  overrides: Partial<WorkflowDefinition> = {}
): WorkflowDefinition {
  return {
    key,
    name: key,
    description: '',
    version: 1,
    triggers: [{ type: 'manual' }],
    nodes,
    edges,
    entryNodeId,
    ...overrides,
  };
}

const annotation = { label: 'test' };

function registerWorkflow(def: WorkflowDefinition) {
  workflowRegistry.set(def.key, def);
}

function registerAction(name: string, handler: (params: unknown) => Promise<unknown>) {
  actionHandlers.set(name, handler);
}

beforeEach(() => {
  vi.clearAllMocks();
  workflowRegistry.clear();
  actionHandlers.clear();
});

// ── Basic execution ───────────────────────────────────────────────────────────

describe('executeWorkflow — unknown workflow', () => {
  it('throws when workflow key is not registered', async () => {
    await expect(executeWorkflow({
      workflowKey: 'not.exist',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    })).rejects.toThrow('Workflow not found: "not.exist"');
  });
});

describe('executeWorkflow — single function node', () => {
  it('executes and returns completed status', async () => {
    registerWorkflow(buildWorkflow('test.single', [
      {
        id: 'step1',
        type: 'function',
        annotation,
        handler: async () => ({ value: 42 }),
      },
    ], [], 'step1'));

    const result = await executeWorkflow({
      workflowKey: 'test.single',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    expect(result.stepCount).toBe(1);
    expect(result.output).toEqual({ value: 42 });
  });

  it('receives input via execution context', async () => {
    let receivedCtx: unknown;

    registerWorkflow(buildWorkflow('test.ctx', [
      {
        id: 'step1',
        type: 'function',
        annotation,
        handler: async (_input, ctx) => { receivedCtx = ctx; return 'done'; },
      },
    ], [], 'step1'));

    await executeWorkflow({
      workflowKey: 'test.ctx',
      input: { companyId: 'c1' },
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect((receivedCtx as any).input).toEqual({ companyId: 'c1' });
  });
});

// ── Action nodes ──────────────────────────────────────────────────────────────

describe('executeWorkflow — action nodes', () => {
  it('calls the registered action with resolved inputMap', async () => {
    const handler = vi.fn().mockResolvedValue({ name: 'Acme' });
    registerAction('company.get', handler);

    registerWorkflow(buildWorkflow('test.action', [
      {
        id: 'fetch',
        type: 'action',
        annotation,
        actionName: 'company.get',
        inputMap: { id: '{{input.companyId}}' },
      },
    ], [], 'fetch'));

    const result = await executeWorkflow({
      workflowKey: 'test.action',
      input: { companyId: 'c123' },
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(handler).toHaveBeenCalledWith({ id: 'c123' }, expect.anything());
    expect(result.output).toEqual({ name: 'Acme' });
  });

  it('throws when action is not found in registry', async () => {
    registerWorkflow(buildWorkflow('test.missing-action', [
      {
        id: 'step1',
        type: 'action',
        annotation,
        actionName: 'not.registered',
        inputMap: {},
      },
    ], [], 'step1'));

    const result = await executeWorkflow({
      workflowKey: 'test.missing-action',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/not.registered/);
  });
});

// ── Linear chains ─────────────────────────────────────────────────────────────

describe('executeWorkflow — linear chain', () => {
  it('executes all steps in order and passes outputs downstream', async () => {
    const order: string[] = [];

    registerWorkflow(buildWorkflow('test.chain', [
      {
        id: 'step1',
        type: 'function',
        annotation,
        handler: async () => { order.push('step1'); return 'result1'; },
      },
      {
        id: 'step2',
        type: 'function',
        annotation,
        handler: async (_input, ctx) => {
          order.push('step2');
          return (ctx.steps['step1']?.output ?? '') + '_extended';
        },
      },
    ], [
      { from: 'step1', to: 'step2' },
    ], 'step1'));

    const result = await executeWorkflow({
      workflowKey: 'test.chain',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(order).toEqual(['step1', 'step2']);
    expect(result.stepCount).toBe(2);
    expect(result.output).toBe('result1_extended');
  });

  it('reports 3-step chain as stepCount 3', async () => {
    registerWorkflow(buildWorkflow('test.three', [
      { id: 'a', type: 'function', annotation, handler: async () => 1 },
      { id: 'b', type: 'function', annotation, handler: async () => 2 },
      { id: 'c', type: 'function', annotation, handler: async () => 3 },
    ], [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ], 'a'));

    const result = await executeWorkflow({
      workflowKey: 'test.three',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.stepCount).toBe(3);
  });
});

// ── Condition branching ───────────────────────────────────────────────────────

describe('executeWorkflow — condition branching', () => {
  function conditionWorkflow(value: unknown) {
    registerAction('get-value', vi.fn().mockResolvedValue(value));
    registerWorkflow(buildWorkflow('test.condition', [
      {
        id: 'check',
        type: 'condition',
        annotation,
        expression: '{{steps.get-data.output}}',
      },
      {
        id: 'get-data',
        type: 'action',
        annotation,
        actionName: 'get-value',
        inputMap: {},
      },
      { id: 'true-branch', type: 'function', annotation, handler: async () => 'true_result' },
      { id: 'false-branch', type: 'function', annotation, handler: async () => 'false_result' },
    ], [
      { from: 'get-data', to: 'check' },
      { from: 'check', to: 'true-branch', label: 'true' },
      { from: 'check', to: 'false-branch', label: 'false' },
    ], 'get-data'));
  }

  it('follows true branch when expression is truthy', async () => {
    conditionWorkflow('some text');

    const result = await executeWorkflow({
      workflowKey: 'test.condition',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    // true-branch was the last step
    expect(result.output).toBe('true_result');
  });

  it('follows false branch when expression is falsy', async () => {
    conditionWorkflow(null);

    const result = await executeWorkflow({
      workflowKey: 'test.condition',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    expect(result.output).toBe('false_result');
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('executeWorkflow — error handling', () => {
  it('returns failed status when a step throws', async () => {
    registerWorkflow(buildWorkflow('test.fail', [
      {
        id: 'step1',
        type: 'function',
        annotation,
        handler: async () => { throw new Error('step failed'); },
      },
    ], [], 'step1'));

    const result = await executeWorkflow({
      workflowKey: 'test.fail',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/step failed/);
  });

  it('continues to next step when onError is "continue"', async () => {
    registerWorkflow(buildWorkflow('test.continue', [
      {
        id: 'failing',
        type: 'function',
        annotation,
        onError: 'continue',
        handler: async () => { throw new Error('ignored error'); },
      },
      {
        id: 'next',
        type: 'function',
        annotation,
        handler: async () => 'next_result',
      },
    ], [
      { from: 'failing', to: 'next' },
    ], 'failing'));

    const result = await executeWorkflow({
      workflowKey: 'test.continue',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    expect(result.stepCount).toBe(2);
  });

  it('skips downstream steps when onError is "skip"', async () => {
    const nextHandler = vi.fn().mockResolvedValue('should_not_run');
    registerWorkflow(buildWorkflow('test.skip', [
      {
        id: 'failing',
        type: 'function',
        annotation,
        onError: 'skip',
        handler: async () => { throw new Error('skipped'); },
      },
    ], [], 'failing'));

    const result = await executeWorkflow({
      workflowKey: 'test.skip',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    // onError: 'skip' — step is skipped, workflow continues
    expect(result.status).toBe('completed');
  });
});

// ── Input schema validation ───────────────────────────────────────────────────

describe('executeWorkflow — input schema validation', () => {
  it('throws when required input is missing', async () => {
    const { z } = await import('zod');
    registerWorkflow(buildWorkflow('test.schema', [
      { id: 'step1', type: 'function', annotation, handler: async () => 'ok' },
    ], [], 'step1', {
      inputSchema: z.object({ companyId: z.string().min(1) }),
    }));

    await expect(executeWorkflow({
      workflowKey: 'test.schema',
      input: {},
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    })).rejects.toThrow(/Invalid input/);
  });

  it('proceeds when input satisfies schema', async () => {
    const { z } = await import('zod');
    registerWorkflow(buildWorkflow('test.schema-ok', [
      { id: 'step1', type: 'function', annotation, handler: async () => 'ok' },
    ], [], 'step1', {
      inputSchema: z.object({ companyId: z.string().min(1) }),
    }));

    const result = await executeWorkflow({
      workflowKey: 'test.schema-ok',
      input: { companyId: 'c1' },
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
  });
});

// ── Parallel nodes ────────────────────────────────────────────────────────────

describe('executeWorkflow — parallel nodes', () => {
  it('executes all branches and collects results', async () => {
    const executed: string[] = [];

    registerWorkflow(buildWorkflow('test.parallel', [
      {
        id: 'fan-out',
        type: 'parallel',
        annotation,
        branches: ['branch-a', 'branch-b'],
      },
      {
        id: 'branch-a',
        type: 'function',
        annotation,
        handler: async () => { executed.push('a'); return 'a'; },
      },
      {
        id: 'branch-b',
        type: 'function',
        annotation,
        handler: async () => { executed.push('b'); return 'b'; },
      },
    ], [
      { from: 'fan-out', to: 'branch-a' },
      { from: 'fan-out', to: 'branch-b' },
    ], 'fan-out'));

    const result = await executeWorkflow({
      workflowKey: 'test.parallel',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    expect(executed).toContain('a');
    expect(executed).toContain('b');
  });
});

// ── Evals ─────────────────────────────────────────────────────────────────────

describe('executeWorkflow — evals', () => {
  it('runs eval function after step and stores results', async () => {
    const evalFn = vi.fn().mockResolvedValue([{
      name: 'score_check',
      passed: true,
      score: 0.9,
      detail: 'Score is 90',
    }]);

    registerWorkflow(buildWorkflow('test.evals', [
      {
        id: 'scored-step',
        type: 'function',
        annotation,
        handler: async () => ({ score: 90 }),
      },
    ], [], 'scored-step', {
      evals: { 'scored-step': evalFn },
    }));

    const result = await executeWorkflow({
      workflowKey: 'test.evals',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(evalFn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');
  });

  it('does not fail the workflow if eval throws', async () => {
    const evalFn = vi.fn().mockRejectedValue(new Error('eval error'));

    registerWorkflow(buildWorkflow('test.eval-throws', [
      {
        id: 'step1',
        type: 'function',
        annotation,
        handler: async () => 'done',
      },
    ], [], 'step1', {
      evals: { 'step1': evalFn },
    }));

    const result = await executeWorkflow({
      workflowKey: 'test.eval-throws',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
  });
});

// ── Loop nodes ───────────────────────────────────────────────────────────────

describe('executeWorkflow — loop nodes', () => {
  it('iterates over items and collects results', async () => {
    const bodyResults: string[] = [];

    registerWorkflow(buildWorkflow('test.loop', [
      {
        id: 'loop-node',
        type: 'loop',
        annotation,
        itemsExpression: '{{input.items}}',
        bodyNodeId: 'body',
        maxIterations: 10,
      },
      {
        id: 'body',
        type: 'function',
        annotation,
        handler: async (_input, ctx) => {
          const item = ctx.loop?.item;
          bodyResults.push(item as string);
          return `processed_${item}`;
        },
      },
    ], [], 'loop-node'));

    const result = await executeWorkflow({
      workflowKey: 'test.loop',
      input: { items: ['a', 'b', 'c'] },
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    expect(bodyResults).toEqual(['a', 'b', 'c']);
    expect((result.output as any).results).toEqual([
      'processed_a', 'processed_b', 'processed_c',
    ]);
    expect((result.output as any).iterationsRun).toBe(3);
  });

  it('respects maxIterations cap', async () => {
    let callCount = 0;

    registerWorkflow(buildWorkflow('test.loop-cap', [
      {
        id: 'loop-node',
        type: 'loop',
        annotation,
        itemsExpression: '{{input.items}}',
        bodyNodeId: 'body',
        maxIterations: 2,
      },
      {
        id: 'body',
        type: 'function',
        annotation,
        handler: async () => { callCount++; return 'ok'; },
      },
    ], [], 'loop-node'));

    const result = await executeWorkflow({
      workflowKey: 'test.loop-cap',
      input: { items: [1, 2, 3, 4, 5] },
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    expect(callCount).toBe(2);
    expect((result.output as any).iterationsRun).toBe(2);
    expect((result.output as any).itemCount).toBe(5);
  });

  it('throws when items expression does not resolve to array', async () => {
    registerWorkflow(buildWorkflow('test.loop-bad-items', [
      {
        id: 'loop-node',
        type: 'loop',
        annotation,
        itemsExpression: '{{input.notAnArray}}',
        bodyNodeId: 'body',
      },
      {
        id: 'body',
        type: 'function',
        annotation,
        handler: async () => 'ok',
      },
    ], [], 'loop-node'));

    const result = await executeWorkflow({
      workflowKey: 'test.loop-bad-items',
      input: { notAnArray: 'string' },
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/array/i);
  });

  it('provides loop.index to body node', async () => {
    const indices: number[] = [];

    registerWorkflow(buildWorkflow('test.loop-index', [
      {
        id: 'loop-node',
        type: 'loop',
        annotation,
        itemsExpression: '{{input.items}}',
        bodyNodeId: 'body',
      },
      {
        id: 'body',
        type: 'function',
        annotation,
        handler: async (_input, ctx) => {
          indices.push(ctx.loop!.index);
          return ctx.loop!.index;
        },
      },
    ], [], 'loop-node'));

    await executeWorkflow({
      workflowKey: 'test.loop-index',
      input: { items: ['x', 'y'] },
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(indices).toEqual([0, 1]);
  });
});

// ── Delay nodes ──────────────────────────────────────────────────────────────

describe('executeWorkflow — delay nodes', () => {
  it('completes after a short delay', async () => {
    registerWorkflow(buildWorkflow('test.delay', [
      {
        id: 'wait',
        type: 'delay',
        annotation,
        delaySeconds: 0,
      },
    ], [], 'wait'));

    const result = await executeWorkflow({
      workflowKey: 'test.delay',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    expect((result.output as any).delaySeconds).toBe(0);
  });

  it('supports expression-based delay', async () => {
    registerWorkflow(buildWorkflow('test.delay-expr', [
      {
        id: 'wait',
        type: 'delay',
        annotation,
        delaySeconds: '{{input.seconds}}',
      },
    ], [], 'wait'));

    const result = await executeWorkflow({
      workflowKey: 'test.delay-expr',
      input: { seconds: 0 },
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
  });
});

// ── Subworkflow nodes ────────────────────────────────────────────────────────

describe('executeWorkflow — subworkflow nodes', () => {
  it('invokes a child workflow and returns its output', async () => {
    registerWorkflow(buildWorkflow('test.child', [
      {
        id: 'child-step',
        type: 'function',
        annotation,
        handler: async (_input, ctx) => {
          return { childResult: 'from-child', receivedInput: ctx.input };
        },
      },
    ], [], 'child-step'));

    registerWorkflow(buildWorkflow('test.parent-sub', [
      {
        id: 'sub',
        type: 'subworkflow',
        annotation,
        workflowKey: 'test.child',
        inputMap: { value: '{{input.parentValue}}' },
      },
    ], [], 'sub'));

    const result = await executeWorkflow({
      workflowKey: 'test.parent-sub',
      input: { parentValue: 'hello' },
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    expect((result.output as any).childResult).toBe('from-child');
  });
});

// ── Retry behavior ───────────────────────────────────────────────────────────

describe('executeWorkflow — retry', () => {
  it('retries a failing step up to maxAttempts then fails', async () => {
    let attempts = 0;

    registerWorkflow(buildWorkflow('test.retry-fail', [
      {
        id: 'flaky',
        type: 'function',
        annotation,
        retryPolicy: { maxAttempts: 3, delayMs: 0 },
        handler: async () => { attempts++; throw new Error('still failing'); },
      },
    ], [], 'flaky'));

    const result = await executeWorkflow({
      workflowKey: 'test.retry-fail',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('failed');
    expect(attempts).toBe(3);
    expect(result.error).toMatch(/still failing/);
  });

  it('succeeds when retry eventually passes', async () => {
    let attempts = 0;

    registerWorkflow(buildWorkflow('test.retry-succeed', [
      {
        id: 'flaky',
        type: 'function',
        annotation,
        retryPolicy: { maxAttempts: 3, delayMs: 0 },
        handler: async () => {
          attempts++;
          if (attempts < 3) throw new Error('transient failure');
          return 'finally worked';
        },
      },
    ], [], 'flaky'));

    const result = await executeWorkflow({
      workflowKey: 'test.retry-succeed',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    expect(attempts).toBe(3);
    expect(result.output).toBe('finally worked');
  });
});

// ── Timeout behavior ─────────────────────────────────────────────────────────

describe('executeWorkflow — timeout', () => {
  it('fails when a step exceeds its timeout', async () => {
    registerWorkflow(buildWorkflow('test.timeout', [
      {
        id: 'slow',
        type: 'function',
        annotation,
        timeoutMs: 50,
        handler: async () => {
          await new Promise((r) => setTimeout(r, 200));
          return 'should not reach';
        },
      },
    ], [], 'slow'));

    const result = await executeWorkflow({
      workflowKey: 'test.timeout',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/timed out/);
  });

  it('completes when step finishes before timeout', async () => {
    registerWorkflow(buildWorkflow('test.fast-enough', [
      {
        id: 'quick',
        type: 'function',
        annotation,
        timeoutMs: 5000,
        handler: async () => 'fast result',
      },
    ], [], 'quick'));

    const result = await executeWorkflow({
      workflowKey: 'test.fast-enough',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('completed');
    expect(result.output).toBe('fast result');
  });
});

// ── Action input validation failure ──────────────────────────────────────────

describe('executeWorkflow — action input validation', () => {
  it('fails when action input does not match schema', async () => {
    const { z } = await import('zod');
    const handler = vi.fn().mockResolvedValue({});

    // Register action with a strict schema instead of passthrough
    actionHandlers.set('strict.action', handler);

    // Override the action registry mock to return a real zod schema for this action
    const { actionRegistry } = await import('@hq/actions');
    vi.mocked(actionRegistry.get).mockImplementation((name: string) => {
      if (name === 'strict.action') {
        return {
          name: 'strict.action',
          handler,
          parameters: z.object({ id: z.string().min(1) }),
        } as any;
      }
      const h = actionHandlers.get(name);
      return h ? { name, handler: h, parameters: passthroughSchema } as any : undefined;
    });

    registerWorkflow(buildWorkflow('test.bad-input', [
      {
        id: 'step1',
        type: 'action',
        annotation,
        actionName: 'strict.action',
        inputMap: { id: '{{input.missing}}' }, // resolves to undefined
      },
    ], [], 'step1'));

    const result = await executeWorkflow({
      workflowKey: 'test.bad-input',
      triggerType: 'manual',
      serviceContext: mockServiceContext,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/validation failed/i);
    expect(handler).not.toHaveBeenCalled();
  });
});
