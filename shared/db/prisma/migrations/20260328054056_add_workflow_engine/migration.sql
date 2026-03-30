-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "workflowVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "triggerType" TEXT NOT NULL,
    "triggerPayload" JSONB NOT NULL DEFAULT '{}',
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "parentRunId" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" TEXT,
    "evals" JSONB NOT NULL DEFAULT '[]',
    "annotation" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowStepLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowKey_status_idx" ON "WorkflowRun"("workflowKey", "status");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowKey_createdAt_idx" ON "WorkflowRun"("workflowKey", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");

-- CreateIndex
CREATE INDEX "WorkflowRun_parentRunId_idx" ON "WorkflowRun"("parentRunId");

-- CreateIndex
CREATE INDEX "WorkflowRun_correlationId_idx" ON "WorkflowRun"("correlationId");

-- CreateIndex
CREATE INDEX "WorkflowStepLog_runId_nodeId_idx" ON "WorkflowStepLog"("runId", "nodeId");

-- CreateIndex
CREATE INDEX "WorkflowStepLog_runId_createdAt_idx" ON "WorkflowStepLog"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowStepLog_status_idx" ON "WorkflowStepLog"("status");

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepLog" ADD CONSTRAINT "WorkflowStepLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
