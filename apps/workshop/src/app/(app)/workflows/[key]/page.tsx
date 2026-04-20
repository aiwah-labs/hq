import { StatusDot, Button, Card, CardBody, EmptyState } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import Link from 'next/link';
import { ArrowLeft, Play, CalendarClock, Timer, Zap, ChevronRight } from 'lucide-react';
import { FlowDiagram } from '@/components/workflows/flow-diagram';
import { triggerWorkflowAction } from './actions';

function statusTone(status: string): 'success' | 'danger' | 'neutral' | 'brand' {
  switch (status) {
    case 'COMPLETED': return 'success';
    case 'FAILED': return 'danger';
    case 'RUNNING': return 'brand';
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

  const totalRuns = Object.values(workflow.stats ?? {}).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : 0), 0);
  const successRate = totalRuns > 0 ? Math.round(((workflow.stats?.COMPLETED ?? 0) / totalRuns) * 100) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <Link href="/workflows" className="font-medium hover:text-[#3d4149] transition-colors" data-testid="link-back-workflows">
            Workflows
          </Link>
          <span className="text-[#d0d6e0]">/</span>
          <span className="truncate">{workflow.name}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]" data-testid="workflow-name">
              {workflow.name}
            </h1>
            {workflow.description && (
              <p className="mt-2 text-[12.5px] text-[#62666d]">{workflow.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            {hasManualTrigger && workflow.requiresInput && (
              <span className="text-[11px] text-[#8a8f98]">Requires input</span>
            )}
            {canTriggerFromUi && (
              <form action={triggerWorkflowAction.bind(null, key)}>
                <Button variant="primary" size="sm" type="submit" data-testid="btn-trigger-workflow">
                  <Play size={12} /> Run
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        {[
          { label: 'Total runs', value: totalRuns },
          { label: 'Success rate', value: successRate != null ? `${successRate}%` : '—', sub: totalRuns > 0 ? `${workflow.stats?.FAILED ?? 0} failed` : undefined },
          { label: 'Steps', value: nodes.length },
          { label: 'Version', value: `v${workflow.version}`, sub: workflow.category ?? undefined },
        ].map((s, i) => (
          <div key={s.label} className={`flex-1 px-4 py-3${i > 0 ? ' border-l border-[#e6e8eb]' : ''}`}>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{s.label}</p>
            <p className="mt-1 text-[18px] font-semibold leading-none tabular-nums tracking-tight text-[#0f1011]">{s.value}</p>
            {s.sub && <p className="mt-1.5 text-[11px] text-[#8a8f98]">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Flow diagram */}
      <Card>
        <div className="flex items-center justify-between border-b border-[#e6e8eb] px-4 py-3">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Flow</h2>
            <p className="text-[11px] text-[#8a8f98]">&mdash; {nodes.length} steps · {edges.length} connections</p>
          </div>
          <div className="flex items-center gap-2">
            {(workflow.triggers ?? []).map((t: any, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 rounded bg-[#f3f4f5] px-1.5 py-0.5 text-[10.5px] font-medium text-[#62666d]">
                {t.type === 'cron' ? <CalendarClock size={10} /> : t.type === 'event' ? <Zap size={10} /> : <Timer size={10} />}
                {t.cronExpression ?? t.eventType ?? t.type}
              </span>
            ))}
          </div>
        </div>
        <CardBody className="overflow-x-auto">
          <FlowDiagram nodes={nodes} edges={edges} entryNodeId={workflow.entryNodeId} />
        </CardBody>
      </Card>

      {/* Run history */}
      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Run history</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; last {runs.length} runs</p>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
          <div className="grid grid-cols-[auto_1fr_80px_80px_100px_24px] items-center border-b border-[#e6e8eb] bg-[#fafbfb] px-4">
            {['Status', 'Run ID', 'Trigger', 'Steps', 'Duration', ''].map((h) => (
              <div key={h} className="h-9 flex items-center text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{h}</div>
            ))}
          </div>

          {runs.length === 0 ? (
            <EmptyState
              title="No runs yet"
              description={canTriggerFromUi ? 'Click Run to test this workflow.' : undefined}
            />
          ) : (
            <div className="divide-y divide-[#eff0f2]">
              {runs.map((run: any) => (
                <Link
                  key={run.id}
                  href={`/workflows/${encodeURIComponent(key)}/runs/${run.id}`}
                  className="group grid grid-cols-[auto_1fr_80px_80px_100px_24px] items-center px-4 h-10 hover:bg-[#fafbfb] transition-colors duration-100"
                  data-testid={`row-run-${run.id}`}
                >
                  <div className="pr-3">
                    <StatusDot tone={statusTone(run.status)} label={run.status} />
                  </div>
                  <code className="text-[11px] font-mono text-[#62666d] truncate">{run.id.slice(0, 16)}</code>
                  <span className="text-[12px] text-[#8a8f98]">{run.triggerType}</span>
                  <span className="text-[12px] tabular-nums text-[#62666d]">{run._count?.steps ?? '—'}</span>
                  <span className="text-[12px] tabular-nums text-[#62666d]">{formatDuration(run.durationMs)}</span>
                  <ChevronRight size={12} className="text-[#d0d6e0] group-hover:text-[#62666d] transition-colors" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
