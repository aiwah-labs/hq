import { Badge, Card, CardBody, CardHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import Link from 'next/link';
import { CheckCircle2, XCircle, Clock, Zap, Timer, CalendarClock } from 'lucide-react';

function statusTone(status: string): 'success' | 'danger' | 'neutral' | 'teal' {
  switch (status) {
    case 'COMPLETED': return 'success';
    case 'FAILED': return 'danger';
    case 'RUNNING': return 'teal';
    default: return 'neutral';
  }
}

function formatDate(d: string | Date | null): string {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(ms: number | null): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function triggerIcon(type: string) {
  switch (type) {
    case 'manual': return <Zap className="h-3 w-3" />;
    case 'event': return <Zap className="h-3 w-3" />;
    case 'cron': return <CalendarClock className="h-3 w-3" />;
    default: return <Timer className="h-3 w-3" />;
  }
}

export default async function WorkflowsPage() {
  await requirePermission(ROUTE_PERMISSIONS.workflows);
  const api = await getSessionApiClient();
  const workflows = await api.get<any[]>('/v1/workflows');

  // Aggregate stats across all workflows
  const totalRuns = workflows.reduce((sum, wf) => sum + (wf.runCount ?? 0), 0);
  const successRuns = workflows.filter((wf) => wf.lastRun?.status === 'COMPLETED').length;
  const failedRuns = workflows.filter((wf) => wf.lastRun?.status === 'FAILED').length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <main className="space-y-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[18px] font-semibold tracking-tight @sm:text-[22px]">
              Workflows
            </h1>
            <p className="mt-1 text-[12px] text-muted">
              Code-defined automation pipelines for enrichment, outreach, and data operations.
            </p>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid gap-3 grid-cols-2 @sm:grid-cols-4">
          <MetricCard label="Workflows" value={workflows.length} />
          <MetricCard label="Total Runs" value={totalRuns} />
          <MetricCard label="Healthy" value={successRuns} sub={`${failedRuns} failed`} />
          <MetricCard
            label="Last Activity"
            value={
              workflows
                .filter((wf) => wf.lastRun)
                .sort((a, b) => new Date(b.lastRun.createdAt).getTime() - new Date(a.lastRun.createdAt).getTime())[0]
                ?.lastRun
                ? formatDate(
                    workflows
                      .filter((wf) => wf.lastRun)
                      .sort((a, b) => new Date(b.lastRun.createdAt).getTime() - new Date(a.lastRun.createdAt).getTime())[0]
                      .lastRun.createdAt
                  )
                : '—'
            }
          />
        </div>

        {/* Workflow List */}
        <Card>
          <CardHeader>
            <h2 className="text-[14px] font-semibold">Registered Workflows</h2>
            <p className="mt-0.5 text-[12px] text-muted">{workflows.length} workflows defined in code</p>
          </CardHeader>
          <CardBody className="p-0">
            {workflows.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-muted" data-testid="workflows-empty">
                No workflows registered. Define workflows in <code className="text-[12px]">shared/workflows/src/workflows/</code>
              </div>
            ) : (
              <div className="divide-y divide-divider/70">
                {workflows.map((wf: any) => (
                  <Link
                    key={wf.key}
                    href={`/workflows/${encodeURIComponent(wf.key)}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-alt/40"
                    data-testid={`row-workflow-${wf.key}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium truncate">{wf.name}</p>
                        {wf.category && (
                          <Badge tone="neutral" className="text-[10px]">{wf.category}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted truncate">{wf.description}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Triggers */}
                      <div className="hidden @sm:flex items-center gap-1">
                        {(wf.triggers ?? []).map((t: any, i: number) => (
                          <span key={i} className="inline-flex items-center gap-0.5 text-[11px] text-muted">
                            {triggerIcon(t.type)}
                            {t.type}
                          </span>
                        ))}
                      </div>
                      {/* Run count */}
                      <span className="text-[12px] text-muted tabular-nums">
                        {wf.runCount ?? 0} runs
                      </span>
                      {/* Last run status */}
                      {wf.lastRun ? (
                        <div className="flex items-center gap-1.5">
                          <Badge tone={statusTone(wf.lastRun.status)} className="text-[10px]">
                            {wf.lastRun.status === 'COMPLETED' && <CheckCircle2 className="h-2.5 w-2.5" />}
                            {wf.lastRun.status === 'FAILED' && <XCircle className="h-2.5 w-2.5" />}
                            {wf.lastRun.status}
                          </Badge>
                          <span className="text-[11px] text-muted">
                            {formatDate(wf.lastRun.createdAt)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted">never run</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
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
