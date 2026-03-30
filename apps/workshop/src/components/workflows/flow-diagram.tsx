'use client';

import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui';
import {
  Database, Globe, Brain, GitBranch, Timer, Layers, RotateCw,
  Workflow, Activity, FileText, Copy, Hash, Users, ShieldCheck,
  CheckCircle2, XCircle, Clock, Play, SkipForward, AlertTriangle,
  ChevronDown, Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlowNode {
  id: string;
  type: string;
  annotation: {
    label: string;
    description?: string;
    category?: string;
    icon?: string;
    color?: string;
  };
  actionName?: string;
  agentKey?: string;
  expression?: string;
  timeoutMs?: number;
  onError?: string;
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

interface StepExecution {
  nodeId: string;
  status: string;
  durationMs?: number | null;
  error?: string | null;
  input?: unknown;
  output?: unknown;
  evals?: Array<{ name: string; passed: boolean; score?: number; detail?: string }>;
  metadata?: Record<string, unknown>;
}

interface FlowDiagramProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  entryNodeId: string;
  /** Step execution data — when provided, nodes show execution results inline */
  stepExecutions?: StepExecution[];
  /** Called when a node with execution data is clicked */
  onNodeClick?: (nodeId: string) => void;
  /** Currently selected node — shown with a ring highlight */
  selectedNodeId?: string | null;
}

// ─── Icon Map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, ReactNode> = {
  'database': <Database className="h-4 w-4" />,
  'globe': <Globe className="h-4 w-4" />,
  'brain': <Brain className="h-4 w-4" />,
  'git-branch': <GitBranch className="h-4 w-4" />,
  'timer': <Timer className="h-4 w-4" />,
  'layers': <Layers className="h-4 w-4" />,
  'rotate-cw': <RotateCw className="h-4 w-4" />,
  'workflow': <Workflow className="h-4 w-4" />,
  'activity': <Activity className="h-4 w-4" />,
  'file-text': <FileText className="h-4 w-4" />,
  'copy': <Copy className="h-4 w-4" />,
  'hash': <Hash className="h-4 w-4" />,
  'users': <Users className="h-4 w-4" />,
  'shield-check': <ShieldCheck className="h-4 w-4" />,
  'check-circle': <CheckCircle2 className="h-4 w-4" />,
  'alert-triangle': <AlertTriangle className="h-4 w-4" />,
  'save': <Database className="h-4 w-4" />,
  'bar-chart-3': <Activity className="h-4 w-4" />,
  'zap': <Zap className="h-4 w-4" />,
};

function getIcon(name?: string): ReactNode {
  if (!name) return <Workflow className="h-4 w-4" />;
  return ICON_MAP[name] ?? <Workflow className="h-4 w-4" />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NODE_TYPE_LABELS: Record<string, string> = {
  action: 'Action',
  agent: 'AI Agent',
  function: 'Function',
  condition: 'Condition',
  delay: 'Delay',
  parallel: 'Parallel',
  loop: 'Loop',
  subworkflow: 'Sub-workflow',
};

function statusTone(status: string): 'success' | 'danger' | 'neutral' | 'teal' {
  switch (status) {
    case 'COMPLETED': return 'success';
    case 'FAILED': return 'danger';
    case 'RUNNING': return 'teal';
    default: return 'neutral';
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'COMPLETED': return <CheckCircle2 className="h-3 w-3" />;
    case 'FAILED': return <XCircle className="h-3 w-3" />;
    case 'RUNNING': return <Play className="h-3 w-3 animate-pulse" />;
    case 'SKIPPED': return <SkipForward className="h-3 w-3" />;
    default: return <Clock className="h-3 w-3" />;
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/** Summarize a JSON value for inline display on a node */
function summarizeOutput(output: unknown): string | null {
  if (output == null) return null;
  if (typeof output === 'boolean') return String(output);
  if (typeof output === 'number') return String(output);
  if (typeof output === 'string') return output.length > 60 ? output.slice(0, 60) + '...' : output;
  if (Array.isArray(output)) return `${output.length} items`;
  if (typeof output === 'object') {
    const keys = Object.keys(output as object);
    if (keys.length === 0) return '{}';
    // Show key highlights
    const highlights: string[] = [];
    const obj = output as Record<string, unknown>;
    for (const key of keys.slice(0, 4)) {
      const val = obj[key];
      if (typeof val === 'number') highlights.push(`${key}: ${val}`);
      else if (typeof val === 'string' && val.length < 30) highlights.push(`${key}: ${val}`);
      else if (typeof val === 'boolean') highlights.push(`${key}: ${val}`);
      else if (Array.isArray(val)) highlights.push(`${key}: [${val.length}]`);
      else highlights.push(key);
    }
    if (keys.length > 4) highlights.push(`+${keys.length - 4} more`);
    return highlights.join(' · ');
  }
  return null;
}

// ─── Layout Engine ────────────────────────────────────────────────────────────

interface LayoutRow {
  type: 'node' | 'branch';
  nodeId?: string;
  branches?: { label: string; nodeIds: string[] }[];
}

function computeLayout(nodes: FlowNode[], edges: FlowEdge[], entryNodeId: string): LayoutRow[] {
  const rows: LayoutRow[] = [];
  const visited = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const outEdges = new Map<string, FlowEdge[]>();
  const inEdges = new Map<string, FlowEdge[]>();

  for (const e of edges) {
    if (!outEdges.has(e.from)) outEdges.set(e.from, []);
    outEdges.get(e.from)!.push(e);
    if (!inEdges.has(e.to)) inEdges.set(e.to, []);
    inEdges.get(e.to)!.push(e);
  }

  function walk(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) return;

    const outs = outEdges.get(nodeId) ?? [];

    if (node.type === 'condition' && outs.length >= 2) {
      rows.push({ type: 'node', nodeId });

      const branchData: { label: string; nodeIds: string[] }[] = [];

      for (const edge of outs) {
        const branchLabel = edge.label ?? '→';
        const branchNodes: string[] = [];

        let current = edge.to;
        while (current && !visited.has(current)) {
          const currentIns = inEdges.get(current) ?? [];
          if (currentIns.length > 1) break;

          branchNodes.push(current);
          visited.add(current);

          const currentOuts = outEdges.get(current) ?? [];
          if (currentOuts.length === 1) {
            current = currentOuts[0].to;
          } else {
            break;
          }
        }

        branchData.push({ label: branchLabel, nodeIds: branchNodes });
      }

      if (branchData.length > 0) {
        rows.push({ type: 'branch', branches: branchData });
      }

      // Continue from convergence points
      for (const node of nodes) {
        if (!visited.has(node.id)) {
          const nodeIns = inEdges.get(node.id) ?? [];
          if (nodeIns.length > 1 && nodeIns.every(e => visited.has(e.from))) {
            walk(node.id);
          }
        }
      }
    } else {
      rows.push({ type: 'node', nodeId });
      for (const edge of outs) {
        walk(edge.to);
      }
    }
  }

  walk(entryNodeId);

  // Add any unvisited nodes (disconnected)
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      rows.push({ type: 'node', nodeId: node.id });
    }
  }

  return rows;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FlowDiagram({ nodes, edges, entryNodeId, stepExecutions, onNodeClick, selectedNodeId }: FlowDiagramProps) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const execMap = new Map(stepExecutions?.map((s) => [s.nodeId, s]) ?? []);
  const layout = computeLayout(nodes, edges, entryNodeId);
  const hasExecution = stepExecutions && stepExecutions.length > 0;

  return (
    <div className="flex flex-col items-center py-2" data-testid="flow-diagram">
      {layout.map((row, i) => {
        const isLast = i === layout.length - 1;

        if (row.type === 'node' && row.nodeId) {
          const node = nodeMap.get(row.nodeId);
          if (!node) return null;
          const exec = execMap.get(row.nodeId);

          return (
            <div key={row.nodeId} className="flex flex-col items-center w-full">
              <FlowNodeCard
                node={node}
                exec={exec}
                isEntry={row.nodeId === entryNodeId}
                showData={hasExecution}
                isSelected={selectedNodeId === row.nodeId}
                onClick={exec && onNodeClick ? () => onNodeClick(row.nodeId!) : undefined}
              />
              {!isLast && <Connector />}
            </div>
          );
        }

        if (row.type === 'branch' && row.branches) {
          return (
            <div key={`branch-${i}`} className="flex flex-col items-center w-full">
              <BranchFork branches={row.branches} nodeMap={nodeMap} execMap={execMap} showData={hasExecution} onNodeClick={onNodeClick} selectedNodeId={selectedNodeId} />
              {!isLast && <Connector />}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// ─── Flow Node Card ───────────────────────────────────────────────────────────

function FlowNodeCard({
  node,
  exec,
  isEntry,
  showData,
  isSelected,
  onClick,
}: {
  node: FlowNode;
  exec?: StepExecution;
  isEntry?: boolean;
  showData?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  const color = node.annotation.color ?? '#6b7280';
  const hasExec = !!exec;
  const outputSummary = exec?.output != null ? summarizeOutput(exec.output) : null;
  const evals = exec?.evals ?? [];

  return (
    <div
      className={cn(
        'relative w-full max-w-[420px] rounded-lg border transition-all',
        hasExec && exec.status === 'FAILED' && 'border-red-500/40 bg-red-500/[0.03]',
        hasExec && exec.status === 'COMPLETED' && 'border-emerald-500/30 bg-emerald-500/[0.02]',
        hasExec && exec.status === 'RUNNING' && 'border-brand-teal/40 bg-brand-teal/[0.03]',
        hasExec && exec.status === 'SKIPPED' && 'border-[var(--app-border)] opacity-50',
        !hasExec && 'border-[var(--app-border)] bg-[var(--app-bg-elevated)]',
        onClick && 'cursor-pointer hover:shadow-md',
        isSelected && 'ring-2 ring-brand-teal ring-offset-1 ring-offset-[var(--app-bg)]',
      )}
      onClick={onClick}
      data-testid={`flow-node-${node.id}`}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: color }}
          >
            {getIcon(node.annotation.icon)}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold truncate">{node.annotation.label}</span>
              {isEntry && <Badge tone="teal" className="text-[9px]">trigger</Badge>}
            </div>
            <span className="text-[11px] text-muted">
              {NODE_TYPE_LABELS[node.type] ?? node.type}
              {node.actionName && <> · <code className="font-mono">{node.actionName}</code></>}
              {node.agentKey && <> · <code className="font-mono">{node.agentKey}</code></>}
            </span>
          </div>

          {/* Status + Duration */}
          {hasExec && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge tone={statusTone(exec.status)} className="text-[9px]">
                {statusIcon(exec.status)} {exec.status}
              </Badge>
              {exec.durationMs != null && (
                <span className="text-[10px] text-muted tabular-nums">{formatDuration(exec.durationMs)}</span>
              )}
            </div>
          )}
        </div>

        {/* Output summary — always visible when execution data exists */}
        {showData && outputSummary && (
          <div className="mt-2 rounded-md bg-[var(--app-input-bg)] px-2.5 py-1.5">
            <p className="text-[11px] text-muted font-mono leading-relaxed truncate">{outputSummary}</p>
          </div>
        )}

        {/* Error */}
        {exec?.error && (
          <div className="mt-2 rounded-md bg-red-500/10 px-2.5 py-1.5">
            <p className="text-[11px] text-red-400 dark:text-red-300 leading-snug">{exec.error}</p>
          </div>
        )}

        {/* Evals */}
        {evals.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {evals.map((ev, ei) => (
              <span
                key={ei}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                  ev.passed ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'
                )}
              >
                {ev.passed ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                {ev.name}
                {ev.score != null && ` ${(ev.score * 100).toFixed(0)}%`}
              </span>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Connector Line ───────────────────────────────────────────────────────────

function Connector() {
  return (
    <div className="flex flex-col items-center py-0.5">
      <div className="h-5 w-px bg-[var(--app-border)]" />
      <ChevronDown className="h-3 w-3 text-[var(--app-border)] -mt-0.5" />
    </div>
  );
}

// ─── Branch Fork ──────────────────────────────────────────────────────────────

function BranchFork({
  branches,
  nodeMap,
  execMap,
  showData,
  onNodeClick,
  selectedNodeId,
}: {
  branches: { label: string; nodeIds: string[] }[];
  nodeMap: Map<string, FlowNode>;
  execMap: Map<string, StepExecution>;
  showData?: boolean;
  onNodeClick?: (nodeId: string) => void;
  selectedNodeId?: string | null;
}) {
  return (
    <div className="w-full">
      {/* Horizontal connector + branch labels */}
      <div className="flex items-start justify-center gap-6 @lg:gap-10">
        {branches.map((branch, bi) => (
          <div key={bi} className="flex flex-col items-center min-w-0 flex-1 max-w-[420px]">
            {/* Branch label */}
            <div className="flex flex-col items-center mb-1">
              <div className="h-3 w-px bg-[var(--app-border)]" />
              <span className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                branch.label === 'true' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5' :
                branch.label === 'false' ? 'border-red-500/30 text-red-500 dark:text-red-400 bg-red-500/5' :
                'border-[var(--app-border)] text-muted bg-[var(--app-bg-elevated)]'
              )}>
                {branch.label}
              </span>
              <div className="h-2 w-px bg-[var(--app-border)]" />
              <ChevronDown className="h-3 w-3 text-[var(--app-border)] -mt-0.5" />
            </div>

            {/* Branch nodes */}
            {branch.nodeIds.map((nodeId, ni) => {
              const node = nodeMap.get(nodeId);
              if (!node) return null;
              const exec = execMap.get(nodeId);

              return (
                <div key={nodeId} className="flex flex-col items-center w-full">
                  <FlowNodeCard
                    node={node}
                    exec={exec}
                    showData={showData}
                    isSelected={selectedNodeId === nodeId}
                    onClick={exec && onNodeClick ? () => onNodeClick(nodeId) : undefined}
                  />
                  {ni < branch.nodeIds.length - 1 && <Connector />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
