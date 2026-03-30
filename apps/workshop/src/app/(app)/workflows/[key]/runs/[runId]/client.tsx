'use client';

import { useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui';
import { FlowDiagram } from '@/components/workflows/flow-diagram';
import { NodeDetailPanel } from '@/components/workflows/node-detail-panel';
import { ExecutionSidebar } from '@/components/workflows/execution-sidebar';

interface StepExecution {
  nodeId: string;
  status: string;
  durationMs?: number | null;
  error?: string | null;
  input?: unknown;
  output?: unknown;
  evals?: Array<{ name: string; passed: boolean; score?: number; detail?: string }>;
  metadata?: Record<string, unknown>;
  annotation?: Record<string, unknown>;
  nodeType?: string;
  attempt?: number;
}

interface RunDetailClientProps {
  definition: {
    name: string;
    nodes: any[];
    edges: any[];
    entryNodeId: string;
  };
  stepExecutions: StepExecution[];
  workflowKey: string;
  workflowName: string;
  allRuns: any[];
  activeRunId: string;
}

export function RunDetailClient({
  definition,
  stepExecutions,
  workflowKey,
  workflowName,
  allRuns,
  activeRunId,
}: RunDetailClientProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedStep = selectedNodeId
    ? stepExecutions.find((s) => s.nodeId === selectedNodeId) ?? null
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold">Execution Flow</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              Click any step to inspect its data
            </p>
          </div>
          {allRuns.length > 1 && (
            <span className="text-[11px] text-muted">{allRuns.length} runs available</span>
          )}
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <div className="flex min-h-[400px]">
          {/* Execution sidebar — quick-swap between runs */}
          {allRuns.length > 1 && (
            <ExecutionSidebar
              workflowKey={workflowKey}
              workflowName={workflowName}
              runs={allRuns}
              activeRunId={activeRunId}
            />
          )}

          {/* Flow diagram — center */}
          <div className="flex-1 overflow-auto border-r border-divider px-4">
            <FlowDiagram
              nodes={definition.nodes}
              edges={definition.edges}
              entryNodeId={definition.entryNodeId}
              stepExecutions={stepExecutions}
              onNodeClick={(nodeId) => setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId)}
              selectedNodeId={selectedNodeId}
            />
          </div>

          {/* NDV panel — right side */}
          {selectedStep ? (
            <div className="w-[380px] shrink-0">
              <NodeDetailPanel
                step={selectedStep}
                onClose={() => setSelectedNodeId(null)}
              />
            </div>
          ) : (
            <div className="hidden @lg:flex w-[380px] shrink-0 items-center justify-center border-l border-divider">
              <p className="text-[12px] text-muted">Select a step to view details</p>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
