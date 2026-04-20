'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui';
import { CheckCircle2, XCircle, Clock, Play, ChevronLeft } from 'lucide-react';

interface ExecutionRun {
  id: string;
  status: string;
  triggerType: string;
  durationMs?: number | null;
  createdAt: string;
  _count?: { steps: number };
}

interface ExecutionSidebarProps {
  workflowKey: string;
  workflowName: string;
  runs: ExecutionRun[];
  activeRunId: string;
}

function statusDot(status: string) {
  switch (status) {
    case 'COMPLETED': return 'bg-emerald-500';
    case 'FAILED': return 'bg-red-500';
    case 'RUNNING': return 'bg-brand-teal animate-pulse';
    default: return 'bg-gray-400';
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'COMPLETED': return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    case 'FAILED': return <XCircle className="h-3 w-3 text-red-500" />;
    case 'RUNNING': return <Play className="h-3 w-3 text-brand-teal" />;
    default: return <Clock className="h-3 w-3 text-gray-400" />;
  }
}

function formatTime(d: string): string {
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ExecutionSidebar({ workflowKey, workflowName, runs, activeRunId }: ExecutionSidebarProps) {
  const router = useRouter();

  return (
    <div className="flex h-full w-[220px] shrink-0 flex-col border-r border-divider bg-[#ffffff]" data-testid="execution-sidebar">
      {/* Header */}
      <div className="shrink-0 border-b border-divider px-3 py-2.5">
        <button
          type="button"
          onClick={() => router.push(`/workflows/${encodeURIComponent(workflowKey)}`)}
          className="flex items-center gap-1 text-[11px] text-muted hover:text-foreground transition-colors"
          data-testid="btn-back-workflow"
        >
          <ChevronLeft className="h-3 w-3" />
          {workflowName}
        </button>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted">
          Executions ({runs.length})
        </p>
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto">
        {runs.map((run) => {
          const isActive = run.id === activeRunId;

          return (
            <button
              key={run.id}
              type="button"
              onClick={() => router.push(`/workflows/${encodeURIComponent(workflowKey)}/runs/${run.id}`)}
              className={cn(
                'w-full text-left px-3 py-2 border-b border-divider/50 transition-colors',
                isActive ? 'bg-brand-teal/5 border-l-2 border-l-brand-teal' : 'hover:bg-[#f7f8f8]'
              )}
              data-testid={`sidebar-run-${run.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {statusIcon(run.status)}
                  <code className="text-[10px] text-muted font-mono">{run.id.slice(0, 8)}</code>
                </div>
                <span className="text-[10px] text-muted">{formatTime(run.createdAt)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                <span>{run.triggerType}</span>
                {run._count?.steps != null && <span>{run._count.steps} steps</span>}
                {run.durationMs != null && <span>{formatDuration(run.durationMs)}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
