import { actionRegistry } from '@hq/actions';
import { emitEvent } from '@hq/events';
import type { ServiceContext } from '@hq/services';
import { getWorkflow } from './registry.js';
import { resolveExpression, resolveInputMap, evaluateCondition } from './expression.js';
import {
  createRun, updateRunStatus,
  createStepLog, updateStepLog, updateStepInput,
} from './persistence.js';
import type {
  WorkflowDefinition, WorkflowExecutionContext, StepResult, StepEval,
  NodeDef, ActionNodeDef, AgentNodeDef, FunctionNodeDef,
  ConditionNodeDef, DelayNodeDef, ParallelNodeDef, LoopNodeDef, SubworkflowNodeDef,
} from './types.js';

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

export interface ExecuteWorkflowOptions {
  workflowKey: string;
  input?: unknown;
  triggerType: string;
  triggerPayload?: unknown;
  serviceContext: ServiceContext;
  parentRunId?: string;
  correlationId?: string;
}

export interface ExecuteWorkflowResult {
  runId: string;
  status: 'completed' | 'failed' | 'paused';
  output?: unknown;
  error?: string;
  stepCount: number;
}

/**
 * Execute a workflow end-to-end. Resolves the definition from the registry,
 * traverses the DAG, persists every step, runs evals, and returns the final result.
 */
export async function executeWorkflow(opts: ExecuteWorkflowOptions): Promise<ExecuteWorkflowResult> {
  const def = getWorkflow(opts.workflowKey);
  if (!def) {
    throw new Error(`Workflow not found: "${opts.workflowKey}"`);
  }

  // Validate input
  if (def.inputSchema) {
    const parsed = def.inputSchema.safeParse(opts.input);
    if (!parsed.success) {
      throw new Error(
        `[workflow:${def.key}] Invalid input: ${JSON.stringify(parsed.error.flatten())}`
      );
    }
  }

  // Create run record
  const run = await createRun({
    workflowKey: def.key,
    workflowVersion: def.version,
    triggerType: opts.triggerType,
    triggerPayload: opts.triggerPayload,
    input: opts.input,
    parentRunId: opts.parentRunId,
    correlationId: opts.correlationId,
  });

  await updateRunStatus(run.id, 'running');

  // Build execution context
  const ctx: WorkflowExecutionContext = {
    runId: run.id,
    workflowKey: def.key,
    triggerPayload: opts.triggerPayload ?? {},
    input: opts.input ?? {},
    steps: {},
    serviceContext: opts.serviceContext,
    variables: {},
  };

  // Build adjacency structures
  const nodeMap = new Map(def.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, typeof def.edges>();
  const incoming = new Map<string, typeof def.edges>();

  for (const edge of def.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from)!.push(edge);
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    incoming.get(edge.to)!.push(edge);
  }

  // Execute DAG
  try {
    await executeNode(def, nodeMap, outgoing, incoming, def.entryNodeId, ctx);

    // Find terminal output — last completed step's output
    const completedSteps = Object.values(ctx.steps).filter((s) => s.status === 'completed');
    const lastStep = completedSteps[completedSteps.length - 1];

    await updateRunStatus(run.id, 'completed', {
      output: lastStep?.output,
      variables: ctx.variables,
    });

    await emitEvent(opts.serviceContext, 'workflow.run.completed', {
      objectType: 'WorkflowRun',
      objectId: run.id,
      payload: { workflowKey: def.key, runId: run.id },
    });

    return {
      runId: run.id,
      status: 'completed',
      output: lastStep?.output,
      stepCount: Object.keys(ctx.steps).length,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await updateRunStatus(run.id, 'failed', {
      error: errorMsg,
      variables: ctx.variables,
    });

    await emitEvent(opts.serviceContext, 'workflow.run.failed', {
      objectType: 'WorkflowRun',
      objectId: run.id,
      payload: { workflowKey: def.key, runId: run.id, error: errorMsg },
    });

    return {
      runId: run.id,
      status: 'failed',
      error: errorMsg,
      stepCount: Object.keys(ctx.steps).length,
    };
  }
}

// ─────────────────────────────────────────────
// DAG TRAVERSAL
// ─────────────────────────────────────────────

async function executeNode(
  def: WorkflowDefinition,
  nodeMap: Map<string, NodeDef>,
  outgoing: Map<string, typeof def.edges>,
  incoming: Map<string, typeof def.edges>,
  nodeId: string,
  ctx: WorkflowExecutionContext
): Promise<void> {
  // Skip if already executed (convergence point in diamond DAGs)
  if (ctx.steps[nodeId]) return;

  const node = nodeMap.get(nodeId);
  if (!node) throw new Error(`Node not found: "${nodeId}"`);

  // Check all incoming edges are satisfied (AND-join).
  // A predecessor is "done" if it has any terminal status: completed, skipped, or failed.
  // Hard failures abort the workflow via a throw before we get here, so 'failed' only
  // reaches this check when onError is 'continue' or 'skip'.
  const inEdges = incoming.get(nodeId) ?? [];
  const terminalStatuses = ['completed', 'skipped', 'failed'];
  for (const edge of inEdges) {
    const sourceResult = ctx.steps[edge.from];
    if (!sourceResult || !terminalStatuses.includes(sourceResult.status)) {
      // Predecessor not done yet — this node will be reached via another path
      return;
    }
  }

  // Execute the node
  const stepResult = await executeStepWithRetry(def, node, ctx);
  ctx.steps[nodeId] = stepResult;

  // If the workflow is paused (delay node), stop traversal
  if (stepResult.status === 'pending') return;

  // If failed and policy is 'fail', throw to abort the workflow
  if (stepResult.status === 'failed' && node.onError !== 'skip' && node.onError !== 'continue') {
    throw new Error(`Step "${nodeId}" failed: ${stepResult.error}`);
  }

  // Resolve next nodes via outgoing edges
  const edges = outgoing.get(nodeId) ?? [];
  const nextNodeIds: string[] = [];

  for (const edge of edges) {
    if (node.type === 'condition') {
      // Condition nodes: route based on the boolean result stored in output
      const conditionResult = !!stepResult.output;
      if (edge.label === 'true' && conditionResult) nextNodeIds.push(edge.to);
      else if (edge.label === 'false' && !conditionResult) nextNodeIds.push(edge.to);
      else if (!edge.label && !edge.condition) nextNodeIds.push(edge.to);
    } else if (edge.condition) {
      // Non-condition node with a guarded edge: evaluate the expression
      if (evaluateCondition(edge.condition, ctx)) nextNodeIds.push(edge.to);
    } else {
      // Unconditional edge from a non-condition node: always follow
      nextNodeIds.push(edge.to);
    }
  }

  // Execute next nodes sequentially (topological order preserved by edge definitions)
  for (const nextId of nextNodeIds) {
    await executeNode(def, nodeMap, outgoing, incoming, nextId, ctx);
  }
}

// ─────────────────────────────────────────────
// STEP EXECUTION WITH RETRY
// ─────────────────────────────────────────────

async function executeStepWithRetry(
  def: WorkflowDefinition,
  node: NodeDef,
  ctx: WorkflowExecutionContext
): Promise<StepResult> {
  const maxAttempts = node.retryPolicy?.maxAttempts ?? 1;
  const retryDelay = node.retryPolicy?.delayMs ?? 1000;
  const backoff = node.retryPolicy?.backoff ?? 'linear';

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const stepStartedAt = new Date();
    const stepLog = await createStepLog({
      runId: ctx.runId,
      nodeId: node.id,
      nodeType: node.type,
      annotation: node.annotation,
      attempt,
    });

    try {
      const result = await executeStepDispatch(node, ctx, stepLog.id);

      // Run evals if defined
      let evals: StepEval[] = [];
      if (def.evals?.[node.id]) {
        try {
          evals = await def.evals[node.id](
            result.input,
            result.output,
            ctx
          );
        } catch (evalErr) {
          ctx.serviceContext.logger.warn(
            `[workflow:${ctx.workflowKey}] Eval for "${node.id}" threw: ${evalErr}`
          );
        }
      }

      const completedAt = new Date();

      await updateStepLog(stepLog.id, {
        status: 'COMPLETED',
        output: result.output,
        evals,
        metadata: result.metadata,
      });

      return {
        nodeId: node.id,
        status: 'completed',
        output: result.output,
        startedAt: stepStartedAt,
        completedAt,
        durationMs: completedAt.getTime() - stepStartedAt.getTime(),
        attempt,
        evals,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      await updateStepLog(stepLog.id, {
        status: 'FAILED',
        error: lastError,
      });

      await emitEvent(ctx.serviceContext, 'workflow.step.failed', {
        objectType: 'WorkflowStepLog',
        objectId: stepLog.id,
        payload: { workflowKey: ctx.workflowKey, runId: ctx.runId, nodeId: node.id, error: lastError, attempt },
      });

      // Retry delay
      if (attempt < maxAttempts) {
        const delay = backoff === 'exponential'
          ? retryDelay * Math.pow(2, attempt - 1)
          : retryDelay * attempt;
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  if (node.onError === 'skip') {
    return {
      nodeId: node.id,
      status: 'skipped',
      error: lastError,
      attempt: maxAttempts,
    };
  }

  return {
    nodeId: node.id,
    status: 'failed',
    error: lastError,
    attempt: maxAttempts,
  };
}

// ─────────────────────────────────────────────
// STEP DISPATCH — routes to the right handler by node type
// ─────────────────────────────────────────────

interface StepDispatchResult {
  input?: unknown;
  output: unknown;
  metadata?: Record<string, unknown>;
}

async function executeStepDispatch(
  node: NodeDef,
  ctx: WorkflowExecutionContext,
  stepLogId: string
): Promise<StepDispatchResult> {
  const timeout = node.timeoutMs ?? 30_000;

  const resultPromise = (async (): Promise<StepDispatchResult> => {
    switch (node.type) {
      case 'action':
        return executeActionNode(node, ctx, stepLogId);
      case 'agent':
        return executeAgentNode(node, ctx, stepLogId);
      case 'function':
        return executeFunctionNode(node, ctx, stepLogId);
      case 'condition':
        return executeConditionNode(node, ctx, stepLogId);
      case 'delay':
        return executeDelayNode(node, ctx);
      case 'parallel':
        return executeParallelNode(node, ctx);
      case 'loop':
        return executeLoopNode(node, ctx, stepLogId);
      case 'subworkflow':
        return executeSubworkflowNode(node, ctx);
      default:
        throw new Error(`Unknown node type: ${(node as any).type}`);
    }
  })();

  // Apply timeout (skip for delay nodes — they're expected to take a while)
  if (node.type === 'delay') return resultPromise;

  return Promise.race([
    resultPromise,
    sleep(timeout).then(() => {
      throw new Error(`Step "${node.id}" timed out after ${timeout}ms`);
    }),
  ]);
}

// ─────────────────────────────────────────────
// NODE TYPE HANDLERS
// ─────────────────────────────────────────────

async function executeActionNode(
  node: ActionNodeDef,
  ctx: WorkflowExecutionContext,
  stepLogId: string
): Promise<StepDispatchResult> {
  const action = actionRegistry.get(node.actionName);
  if (!action) throw new Error(`Action not found: "${node.actionName}"`);

  const input = node.inputMap
    ? resolveInputMap(node.inputMap, ctx)
    : {};

  await updateStepInput(stepLogId, input);

  // Validate against action's parameter schema
  const parsed = action.parameters.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Action "${node.actionName}" input validation failed: ${JSON.stringify(parsed.error.flatten())}`
    );
  }

  const output = await action.handler(parsed.data, ctx.serviceContext);

  return {
    input,
    output,
    metadata: { actionName: node.actionName },
  };
}

async function executeAgentNode(
  node: AgentNodeDef,
  ctx: WorkflowExecutionContext,
  stepLogId: string
): Promise<StepDispatchResult> {
  // Lazy import to avoid circular dep at module load time
  const { executeAgentTurn } = await import('@hq/agents');

  const prompt = resolveExpression(node.prompt, ctx);
  const input = { prompt, tools: node.tools };

  await updateStepInput(stepLogId, input);

  const result = await executeAgentTurn(node.agentKey, {
    type: 'message',
    text: String(prompt),
    mode: 'dm',
    correlationId: ctx.runId,
  });

  return {
    input,
    output: { text: result.text, threadId: result.threadId, blocks: result.blocks },
    metadata: {
      agentKey: node.agentKey,
    },
  };
}

async function executeFunctionNode(
  node: FunctionNodeDef,
  ctx: WorkflowExecutionContext,
  stepLogId: string
): Promise<StepDispatchResult> {
  // Function nodes receive the full context — they pick what they need via ctx.steps
  // We log a summary of available step outputs for observability
  const availableSteps = Object.fromEntries(
    Object.entries(ctx.steps)
      .filter(([, s]) => s.status === 'completed')
      .map(([id]) => [id, true])
  );

  await updateStepInput(stepLogId, { availableSteps });

  const output = await node.handler(undefined, ctx);

  return { input: { availableSteps }, output };
}

async function executeConditionNode(
  node: ConditionNodeDef,
  ctx: WorkflowExecutionContext,
  stepLogId: string
): Promise<StepDispatchResult> {
  const result = evaluateCondition(node.expression, ctx);
  const input = { expression: node.expression };

  await updateStepInput(stepLogId, input);

  return {
    input,
    output: result,
    metadata: { expression: node.expression, result },
  };
}

async function executeDelayNode(
  node: DelayNodeDef,
  ctx: WorkflowExecutionContext
): Promise<StepDispatchResult> {
  const seconds = typeof node.delaySeconds === 'number'
    ? node.delaySeconds
    : Number(resolveExpression(node.delaySeconds, ctx));

  if (isNaN(seconds) || seconds < 0) {
    throw new Error(`Invalid delay: ${node.delaySeconds}`);
  }

  // For short delays (< 60s), just sleep inline
  // For longer delays, this should use pg-boss scheduling (future enhancement)
  await sleep(seconds * 1000);

  return { output: { delaySeconds: seconds } };
}

async function executeParallelNode(
  node: ParallelNodeDef,
  ctx: WorkflowExecutionContext
): Promise<StepDispatchResult> {
  const branchPromises = node.branches.map(async (branchId) => {
    const branchNodeDef = findNodeInWorkflow(ctx.workflowKey, branchId);
    if (!branchNodeDef) throw new Error(`Parallel branch node not found: "${branchId}"`);

    const branchStepLog = await createStepLog({
      runId: ctx.runId,
      nodeId: branchId,
      nodeType: branchNodeDef.type,
      annotation: branchNodeDef.annotation,
    });

    try {
      const result = await executeStepDispatch(branchNodeDef, ctx, branchStepLog.id);
      await updateStepLog(branchStepLog.id, { status: 'COMPLETED', output: result.output });

      ctx.steps[branchId] = {
        nodeId: branchId,
        status: 'completed',
        output: result.output,
        attempt: 1,
      };

      return { branchId, output: result.output };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await updateStepLog(branchStepLog.id, { status: 'FAILED', error: errMsg });

      ctx.steps[branchId] = { nodeId: branchId, status: 'failed', error: errMsg, attempt: 1 };

      return { branchId, error: errMsg };
    }
  });

  const waitForAll = node.waitForAll ?? true;
  const results = waitForAll
    ? await Promise.allSettled(branchPromises).then((settled) =>
        settled.map((s) => s.status === 'fulfilled' ? s.value : { branchId: 'unknown', error: String(s.reason) })
      )
    : [await Promise.race(branchPromises)];

  return {
    output: { branches: results },
    metadata: { branchCount: node.branches.length, waitForAll },
  };
}

async function executeLoopNode(
  node: LoopNodeDef,
  ctx: WorkflowExecutionContext,
  stepLogId: string
): Promise<StepDispatchResult> {
  const items = resolveExpression(node.itemsExpression, ctx);

  if (!Array.isArray(items)) {
    throw new Error(
      `Loop "${node.id}" itemsExpression did not resolve to an array: ${typeof items}`
    );
  }

  const maxIterations = node.maxIterations ?? 100;
  const results: unknown[] = [];

  await updateStepInput(stepLogId, { itemCount: items.length, maxIterations });

  for (let i = 0; i < Math.min(items.length, maxIterations); i++) {
    // Set loop context
    ctx.loop = { item: items[i], index: i };

    // Execute body node — create a fresh step result for each iteration
    const bodyNode = ctx.steps[node.bodyNodeId];
    if (bodyNode) {
      // Clear previous iteration result so the node re-executes
      delete ctx.steps[node.bodyNodeId];
    }

    // Inline execution of the body node (not via DAG traversal — loop owns it)
    const bodyNodeDef = findNodeInWorkflow(ctx.workflowKey, node.bodyNodeId);
    if (!bodyNodeDef) throw new Error(`Loop body node not found: "${node.bodyNodeId}"`);

    const bodyStepLog = await createStepLog({
      runId: ctx.runId,
      nodeId: `${node.bodyNodeId}[${i}]`,
      nodeType: bodyNodeDef.type,
      annotation: { ...bodyNodeDef.annotation, label: `${bodyNodeDef.annotation.label} [${i}]` },
    });

    try {
      const result = await executeStepDispatch(bodyNodeDef, ctx, bodyStepLog.id);
      await updateStepLog(bodyStepLog.id, { status: 'COMPLETED', output: result.output });
      results.push(result.output);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await updateStepLog(bodyStepLog.id, { status: 'FAILED', error: errMsg });

      if (node.onError === 'continue') {
        results.push({ _error: errMsg });
      } else {
        throw err;
      }
    }
  }

  // Clear loop context
  ctx.loop = undefined;

  return {
    output: { results, itemCount: items.length, iterationsRun: results.length },
    metadata: { itemCount: items.length },
  };
}

async function executeSubworkflowNode(
  node: SubworkflowNodeDef,
  ctx: WorkflowExecutionContext
): Promise<StepDispatchResult> {
  const input = node.inputMap
    ? resolveInputMap(node.inputMap, ctx)
    : {};

  const result = await executeWorkflow({
    workflowKey: node.workflowKey,
    input,
    triggerType: 'subworkflow',
    triggerPayload: { parentRunId: ctx.runId, parentWorkflow: ctx.workflowKey },
    serviceContext: ctx.serviceContext,
    parentRunId: ctx.runId,
  });

  return {
    input,
    output: result.output,
    metadata: { subRunId: result.runId, subStatus: result.status },
  };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function findNodeInWorkflow(workflowKey: string, nodeId: string): NodeDef | undefined {
  const def = getWorkflow(workflowKey);
  return def?.nodes.find((n) => n.id === nodeId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
