import { Badge, Button } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Clock, Play, RotateCcw, Ban } from 'lucide-react';
import { cancelRunAction, retryRunAction } from '../../actions';
import { RunDetailClient } from './client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    case 'COMPLETED': return <CheckCircle2 className="h-3.5 w-3.5" />;
    case 'FAILED': return <XCircle className="h-3.5 w-3.5" />;
    case 'RUNNING': return <Play className="h-3.5 w-3.5" />;
    default: return <Clock className="h-3.5 w-3.5" />;
  }
}

function formatTimestamp(d: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkflowRunDetailPage({
  params,
}: {
  params: Promise<{ key: string; runId: string }>;
}) {
  await requirePermission(ROUTE_PERMISSIONS.workflows);
  const { key, runId } = await params;
  const api = await getSessionApiClient();

  const [res, allRunsRes] = await Promise.all([
    api.get<any>(`/v1/workflows/${encodeURIComponent(key)}/runs/${runId}`),
    api.get<any>(`/v1/workflows/${encodeURIComponent(key)}/runs?limit=30`),
  ]);

  const run = res.run;
  const definition = res.definition;
  const steps: any[] = run?.steps ?? [];
  const allRuns = allRunsRes.data ?? [];

  if (!run) {
    return (
      <div className="space-y-4">
        <Link href={`/workflows/${encodeURIComponent(key)}`} className="inline-flex items-center gap-1 text-[12px] text-[#62666d] hover:text-[#0f1011]">
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <p className="text-[13px] text-[#62666d]">Run not found.</p>
      </div>
    );
  }

  const canCancel = ['PENDING', 'RUNNING', 'PAUSED'].includes(run.status);
  const canRetry = run.status === 'FAILED';
  const completedSteps = steps.filter((s: any) => s.status === 'COMPLETED').length;
  const failedSteps = steps.filter((s: any) => s.status === 'FAILED').length;

  // Prepare step executions for the flow diagram + NDV
  const stepExecutions = steps.map((s: any) => ({
    nodeId: s.nodeId,
    status: s.status,
    durationMs: s.durationMs,
    error: s.error,
    input: s.input,
    output: s.output,
    evals: s.evals,
    metadata: s.metadata,
    annotation: s.annotation,
    nodeType: s.nodeType,
    attempt: s.attempt,
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <Link href="/workflows" className="font-medium hover:text-[#0f1011] transition-colors">Workflows</Link>
          <span className="text-[#d0d6e0]">/</span>
          <Link
            href={`/workflows/${encodeURIComponent(key)}`}
            className="hover:text-[#0f1011] transition-colors"
            data-testid="link-back-workflow"
          >
            {definition?.name ?? key}
          </Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>Run</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]" data-testid="run-title">
                Run
              </h1>
              <code className="font-mono text-[13px] text-[#8a8f98]">{run.id.slice(0, 16)}</code>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={statusTone(run.status)} data-testid="badge-run-status">
                {statusIcon(run.status)} {run.status}
              </Badge>
              <span className="text-[12px] text-[#62666d]">
                {formatTimestamp(run.startedAt)} · {formatDuration(run.durationMs)} · v{run.workflowVersion}
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {canCancel && (
              <form action={cancelRunAction.bind(null, key, runId)}>
                <Button variant="ghost" size="sm" type="submit" data-testid="btn-cancel-run" aria-label="Cancel run">
                  <Ban className="h-3.5 w-3.5" /> Cancel
                </Button>
              </form>
            )}
            {canRetry && (
              <form action={retryRunAction.bind(null, key, runId)}>
                <Button variant="secondary" size="sm" type="submit" data-testid="btn-retry-run" aria-label="Retry run">
                  <RotateCcw className="h-3.5 w-3.5" /> Retry
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Metrics — stat row */}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        {[
          { label: 'Steps', value: steps.length, sub: `${completedSteps} passed` },
          { label: 'Failed', value: failedSteps },
          { label: 'Duration', value: formatDuration(run.durationMs) },
          { label: 'Trigger', value: run.triggerType },
        ].map((m, i) => (
          <div key={m.label} className={`flex-1 px-4 py-3${i > 0 ? ' border-l border-[#e6e8eb]' : ''}`}>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{m.label}</p>
            <p className="mt-1 text-[18px] font-semibold leading-none tabular-nums tracking-tight text-[#0f1011]">{m.value}</p>
            {m.sub && <p className="mt-0.5 text-[11px] text-[#8a8f98]">{m.sub}</p>}
          </div>
        ))}
      </div>

      {/* Flow + NDV panel */}
      {definition && (
        <RunDetailClient
          definition={definition}
          stepExecutions={stepExecutions}
          workflowKey={key}
          workflowName={definition.name}
          allRuns={allRuns}
          activeRunId={runId}
        />
      )}

      {/* Run-level I/O */}
      <div className="grid gap-4 @lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
          <div className="border-b border-[#e6e8eb] px-4 py-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Run Input</h2>
          </div>
          <div className="p-3">
            <pre className="max-h-[180px] overflow-auto font-mono text-[11px] leading-relaxed text-[#62666d]">
              {JSON.stringify(run.input, null, 2)}
            </pre>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
          <div className="border-b border-[#e6e8eb] px-4 py-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Run Output</h2>
          </div>
          <div className="p-3">
            {run.error ? (
              <div className="rounded-md bg-red-500/10 p-3 text-[12px] text-red-400" data-testid="run-error">
                {run.error}
              </div>
            ) : (
              <pre className="max-h-[180px] overflow-auto font-mono text-[11px] leading-relaxed text-[#62666d]">
                {run.output ? JSON.stringify(run.output, null, 2) : 'null'}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

