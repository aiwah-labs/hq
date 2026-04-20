import { db } from '@hq/db';

// ─────────────────────────────────────────────
// WORKFLOW RUN CRUD
// ─────────────────────────────────────────────

export async function createRun(params: {
  workflowKey: string;
  inputData?: unknown;
}) {
  return db.workflowRun.create({
    data: {
      workflowKey: params.workflowKey,
      inputData: (params.inputData ?? {}) as object,
      status: 'PENDING',
    },
  });
}

export async function updateRunStatus(
  runId: string,
  status: string,
  data?: { error?: string }
) {
  return db.workflowRun.update({
    where: { id: runId },
    data: {
      status: status.toUpperCase() as any,
      ...(['COMPLETED', 'FAILED', 'CANCELLED'].includes(status.toUpperCase())
        ? { finishedAt: new Date() }
        : {}),
      ...(data?.error !== undefined ? { error: data.error } : {}),
    },
  });
}

export async function getRun(runId: string) {
  return db.workflowRun.findUnique({
    where: { id: runId },
    include: {
      steps: { orderBy: { startedAt: 'asc' } },
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
    orderBy: { startedAt: 'desc' },
    take: limit + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: { _count: { select: { steps: true } } },
  });

  const hasMore = runs.length > limit;
  const data = hasMore ? runs.slice(0, limit) : runs;

  return {
    data,
    nextCursor: hasMore ? data[data.length - 1]?.id : null,
  };
}

// ─────────────────────────────────────────────
// STEP CRUD
// ─────────────────────────────────────────────

export async function createStep(params: {
  runId: string;
  nodeId: string;
  inputData?: unknown;
}) {
  return db.workflowRunStep.create({
    data: {
      runId: params.runId,
      nodeId: params.nodeId,
      status: 'RUNNING',
      inputData: (params.inputData ?? null) as object,
      startedAt: new Date(),
    },
  });
}

export async function updateStep(
  stepId: string,
  data: {
    status: 'COMPLETED' | 'FAILED';
    outputData?: unknown;
    error?: string;
  }
) {
  return db.workflowRunStep.update({
    where: { id: stepId },
    data: {
      status: data.status,
      finishedAt: new Date(),
      ...(data.outputData !== undefined ? { outputData: data.outputData as object } : {}),
      ...(data.error !== undefined ? { error: data.error } : {}),
    },
  });
}

export async function getStepLog(stepId: string) {
  return db.workflowRunStep.findUnique({ where: { id: stepId } });
}

export async function listStepLogs(runId: string) {
  return db.workflowRunStep.findMany({
    where: { runId },
    orderBy: { startedAt: 'asc' },
  });
}
