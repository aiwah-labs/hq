import { db } from '@hq/db';
import type { StepEval, NodeAnnotation, WorkflowRunStatus } from './types.js';

// ─────────────────────────────────────────────
// WORKFLOW RUN CRUD
// ─────────────────────────────────────────────

export async function createRun(params: {
  workflowKey: string;
  workflowVersion: number;
  triggerType: string;
  triggerPayload?: unknown;
  input?: unknown;
  parentRunId?: string;
  correlationId?: string;
}) {
  return db.workflowRun.create({
    data: {
      workflowKey: params.workflowKey,
      workflowVersion: params.workflowVersion,
      triggerType: params.triggerType,
      triggerPayload: (params.triggerPayload ?? {}) as object,
      input: (params.input ?? {}) as object,
      parentRunId: params.parentRunId,
      correlationId: params.correlationId,
      status: 'PENDING',
    },
  });
}

export async function updateRunStatus(
  runId: string,
  status: WorkflowRunStatus,
  data?: { output?: unknown; error?: string; variables?: unknown }
) {
  const now = new Date();
  const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });

  const durationMs = run.startedAt ? now.getTime() - run.startedAt.getTime() : null;

  return db.workflowRun.update({
    where: { id: runId },
    data: {
      status: status.toUpperCase() as any,
      ...(status === 'running' && !run.startedAt ? { startedAt: now } : {}),
      ...(['completed', 'failed', 'cancelled'].includes(status) ? { completedAt: now, durationMs } : {}),
      ...(data?.output !== undefined ? { output: data.output as object } : {}),
      ...(data?.error !== undefined ? { error: data.error } : {}),
      ...(data?.variables !== undefined ? { variables: data.variables as object } : {}),
    },
  });
}

export async function getRun(runId: string) {
  return db.workflowRun.findUnique({
    where: { id: runId },
    include: {
      steps: { orderBy: { createdAt: 'asc' } },
      childRuns: { orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function listRuns(
  workflowKey: string,
  options?: { cursor?: string; limit?: number; status?: string }
) {
  const limit = Math.min(options?.limit ?? 50, 100);

  const runs = await db.workflowRun.findMany({
    where: {
      workflowKey,
      ...(options?.status ? { status: options.status.toUpperCase() as any } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: {
      _count: { select: { steps: true } },
    },
  });

  const hasMore = runs.length > limit;
  const data = hasMore ? runs.slice(0, limit) : runs;

  return {
    data,
    nextCursor: hasMore ? data[data.length - 1]?.id : null,
  };
}

// ─────────────────────────────────────────────
// STEP LOG CRUD
// ─────────────────────────────────────────────

export async function createStepLog(params: {
  runId: string;
  nodeId: string;
  nodeType: string;
  annotation: NodeAnnotation;
  attempt?: number;
}) {
  return db.workflowStepLog.create({
    data: {
      runId: params.runId,
      nodeId: params.nodeId,
      nodeType: params.nodeType,
      annotation: params.annotation as object,
      attempt: params.attempt ?? 1,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });
}

export async function updateStepLog(
  stepLogId: string,
  data: {
    status: 'COMPLETED' | 'FAILED' | 'SKIPPED';
    output?: unknown;
    error?: string;
    evals?: StepEval[];
    metadata?: Record<string, unknown>;
  }
) {
  const now = new Date();
  const step = await db.workflowStepLog.findUniqueOrThrow({ where: { id: stepLogId } });

  const durationMs = step.startedAt ? now.getTime() - step.startedAt.getTime() : null;

  return db.workflowStepLog.update({
    where: { id: stepLogId },
    data: {
      status: data.status,
      completedAt: now,
      durationMs,
      ...(data.output !== undefined ? { output: data.output as object } : {}),
      ...(data.error !== undefined ? { error: data.error } : {}),
      ...(data.evals ? { evals: data.evals as object[] } : {}),
      ...(data.metadata ? { metadata: data.metadata as object } : {}),
    },
  });
}

export async function updateStepInput(stepLogId: string, input: unknown) {
  return db.workflowStepLog.update({
    where: { id: stepLogId },
    data: { input: input as object },
  });
}

export async function getStepLog(stepLogId: string) {
  return db.workflowStepLog.findUnique({
    where: { id: stepLogId },
  });
}

export async function listStepLogs(runId: string) {
  return db.workflowStepLog.findMany({
    where: { runId },
    orderBy: { createdAt: 'asc' },
  });
}
