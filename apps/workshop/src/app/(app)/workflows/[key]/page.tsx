import { Badge, Button, Card, CardBody, CardHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import Link from 'next/link';
import { ArrowLeft, Play, CheckCircle2, XCircle, Clock, Zap, CalendarClock, Timer, ChevronRight } from 'lucide-react';
import { FlowDiagram } from '@/components/workflows/flow-diagram';
import { triggerWorkflowAction } from './actions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkflowDetailPage({ params }: { params: Promise<{ key: string }> }) {
  await requirePermission(ROUTE_PERMISSIONS.workflows);
  const { key } = await params;
  const api = await getSessionApiClient();

  const workflow = await api.get<any>(`/v1/workflows/${encodeURIComponent(key)}`);
  const runsRes = await api.get<any>(`/v1/workflows/${encodeURIComponent(key)}/runs?limit=20`);
  const runs = runsRes.data ?? [];

  const hasManualTrigger = workflow.triggers?.some((t: any) => t.type === 'manual');
  const canTriggerFromUi = hasManualTrigger && !workflow.requiresInput;
  const nodes: any[] = workflow.nodes ?? [];
  const edges: any[] = workflow.edges ?? [];

  // Stats
  const totalRuns = Object.values(workflow.stats ?? {}).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : 0), 0);
  const successRate = totalRuns > 0 ? Math.round(((workflow.stats?.COMPLETED ?? 0) / totalRuns) * 100) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <main className="space-y-5 pt-4">
        {/* Header */}
        <div>
          <Link href="/workflows" className="mb-2 inline-flex items-center gap-1 text-[12px] text-muted hover:text-foreground" data-testid="link-back-workflows">
            <ArrowLeft className="h-3 w-3" /> All Workflows
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-[18px] font-semibold tracking-tight @sm:text-[22px]" data-testid="workflow-name">
                {workflow.name}
              </h1>
              <p className="mt-1 text-[12px] text-muted">{workflow.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasManualTrigger && workflow.requiresInput && (
                <Badge tone="neutral" className="text-[10px]">Requires input</Badge>
              )}
              {canTriggerFromUi && (
                <form action={triggerWorkflowAction.bind(null, key)}>
                  <Button variant="primary" size="sm" type="submit" data-testid="btn-trigger-workflow" aria-label="Run workflow">
                    <Play className="h-3.5 w-3.5" /> Run
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid gap-3 grid-cols-2 @sm:grid-cols-4">
          <MetricCard label="Total Runs" value={totalRuns} />
          <MetricCard label="Success Rate" value={successRate != null ? `${successRate}%` : '—'} sub={totalRuns > 0 ? `${workflow.stats?.FAILED ?? 0} failed` : undefined} />
          <MetricCard label="Steps" value={nodes.length} />
          <MetricCard label="Version" value={`v${workflow.version}`} sub={workflow.category ?? undefined} />
        </div>

        {/* Flow Diagram */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold">Workflow</h2>
                <p className="mt-0.5 text-[12px] text-muted">{nodes.length} steps · {edges.length} connections</p>
              </div>
              <div className="flex gap-1">
                {(workflow.triggers ?? []).map((t: any, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] text-muted">
                    {t.type === 'manual' && <Zap className="h-3 w-3" />}
                    {t.type === 'event' && <Zap className="h-3 w-3" />}
                    {t.type === 'cron' && <CalendarClock className="h-3 w-3" />}
                    {t.type === 'action_hook' && <Timer className="h-3 w-3" />}
                    {t.type}
                    {t.eventType && <code className="font-mono text-[10px]">{t.eventType}</code>}
                    {t.cronExpression && <code className="font-mono text-[10px]">{t.cronExpression}</code>}
                  </span>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardBody className="overflow-x-auto">
            <FlowDiagram
              nodes={nodes}
              edges={edges}
              entryNodeId={workflow.entryNodeId}
            />
          </CardBody>
        </Card>

        {/* Run History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">Run History</h2>
              {runs.length > 0 && (
                <span className="text-[12px] text-muted">{runs.length} recent runs</span>
              )}
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {runs.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-muted">
                No runs yet.{canTriggerFromUi ? ' Click Run to test this workflow.' : ''}
              </div>
            ) : (
              <div className="divide-y divide-divider/70">
                {runs.map((run: any) => (
                  <Link
                    key={run.id}
                    href={`/workflows/${encodeURIComponent(key)}/runs/${run.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-surface-alt/40"
                    data-testid={`row-run-${run.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge tone={statusTone(run.status)} className="text-[10px] shrink-0">
                        {run.status === 'COMPLETED' && <CheckCircle2 className="h-2.5 w-2.5" />}
                        {run.status === 'FAILED' && <XCircle className="h-2.5 w-2.5" />}
                        {run.status === 'RUNNING' && <Clock className="h-2.5 w-2.5" />}
                        {run.status}
                      </Badge>
                      <code className="text-[11px] text-muted font-mono truncate">{run.id.slice(0, 16)}</code>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-[12px] text-muted">
                      <span>{run.triggerType}</span>
                      <span className="tabular-nums">{run._count?.steps ?? '—'} steps</span>
                      <span className="tabular-nums">{formatDuration(run.durationMs)}</span>
                      <span>{formatDate(run.createdAt)}</span>
                      <ChevronRight className="h-3.5 w-3.5" />
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

// ─── Sub-components ─────────────────────────────────────────────────────────

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
