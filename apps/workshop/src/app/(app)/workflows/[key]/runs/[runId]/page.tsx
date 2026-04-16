import { Badge, Button, Card, CardBody, CardHeader } from '@/components/ui';
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
      <div className="flex h-full min-h-0 flex-col">
        <main className="pt-4">
          <Link href={`/workflows/${encodeURIComponent(key)}`} className="mb-2 inline-flex items-center gap-1 text-[12px] text-muted hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Back
          </Link>
          <p className="text-[13px] text-muted">Run not found.</p>
        </main>
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
    <div className="flex h-full min-h-0 flex-col">
      <main className="space-y-5 pt-4">
        {/* Header */}
        <div>
          <Link
            href={`/workflows/${encodeURIComponent(key)}`}
            className="mb-2 inline-flex items-center gap-1 text-[12px] text-muted hover:text-foreground"
            data-testid="link-back-workflow"
          >
            <ArrowLeft className="h-3 w-3" /> {definition?.name ?? key}
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-[18px] font-semibold tracking-tight @sm:text-[22px]" data-testid="run-title">
                  Run
                </h1>
                <code className="text-[13px] text-muted font-mono">{run.id.slice(0, 16)}</code>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Badge tone={statusTone(run.status)} data-testid="badge-run-status">
                  {statusIcon(run.status)} {run.status}
                </Badge>
                <span className="text-[12px] text-muted">
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

        {/* Metrics */}
        <div className="grid gap-3 grid-cols-2 @sm:grid-cols-4">
          <MetricCard label="Steps" value={steps.length} sub={`${completedSteps} passed`} />
          <MetricCard label="Failed" value={failedSteps} />
          <MetricCard label="Duration" value={formatDuration(run.durationMs)} />
          <MetricCard label="Trigger" value={run.triggerType} />
        </div>

        {/* Flow + NDV panel — client component manages node selection state */}
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
          <Card>
            <CardHeader>
              <h2 className="text-[14px] font-semibold">Run Input</h2>
            </CardHeader>
            <CardBody className="pt-0">
              <pre className="max-h-[180px] overflow-auto rounded-md bg-[var(--app-input-bg)] p-3 font-mono text-[11px] leading-relaxed text-muted">
                {JSON.stringify(run.input, null, 2)}
              </pre>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="text-[14px] font-semibold">Run Output</h2>
            </CardHeader>
            <CardBody className="pt-0">
              {run.error ? (
                <div className="rounded-md bg-red-500/10 p-3 text-[12px] text-red-400 dark:text-red-300" data-testid="run-error">
                  {run.error}
                </div>
              ) : (
                <pre className="max-h-[180px] overflow-auto rounded-md bg-[var(--app-input-bg)] p-3 font-mono text-[11px] leading-relaxed text-muted">
                  {run.output ? JSON.stringify(run.output, null, 2) : 'null'}
                </pre>
              )}
            </CardBody>
          </Card>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardBody className="p-3 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="text-[22px] font-semibold tracking-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted">{sub}</p>}
      </CardBody>
    </Card>
  );
}
