import { StatusDot, Badge, EmptyState } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import Link from 'next/link';
import { CalendarClock, Timer, Zap } from 'lucide-react';

function statusDotTone(status: string): 'success' | 'danger' | 'neutral' | 'brand' {
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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(ms: number | null): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function TriggerChip({ type }: { type: string }) {
  const icon =
    type === 'cron' ? <CalendarClock size={10} /> :
    type === 'event' ? <Zap size={10} /> :
    <Timer size={10} />;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-[#f3f4f5] px-1.5 py-0.5 text-[10.5px] font-medium text-[#62666d]">
      {icon}
      {type}
    </span>
  );
}

export default async function WorkflowsPage() {
  await requirePermission(ROUTE_PERMISSIONS.workflows);
  const api = await getSessionApiClient();
  const workflows = await api.get<any[]>('/v1/workflows');

  const totalRuns = workflows.reduce((sum, wf) => sum + (wf.runCount ?? 0), 0);
  const successCount = workflows.filter((wf) => wf.lastRun?.status === 'COMPLETED').length;
  const failedCount = workflows.filter((wf) => wf.lastRun?.status === 'FAILED').length;
  const lastActiveWf = workflows
    .filter((wf) => wf.lastRun)
    .sort((a, b) => new Date(b.lastRun.createdAt).getTime() - new Date(a.lastRun.createdAt).getTime())[0];

  return (
    <div className="space-y-4" data-testid="workflows-page">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <span>Workflows</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]" data-testid="workflows-title">
          Workflows
        </h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          Code-defined automation pipelines for enrichment, outreach, and data operations.
        </p>
      </div>

      {/* Stat row — one bordered container, hairline dividers */}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        {[
          { label: 'Workflows', value: workflows.length, sub: 'registered' },
          { label: 'Total runs', value: totalRuns, sub: 'all time' },
          { label: 'Healthy', value: successCount, sub: `${failedCount} failed` },
          { label: 'Last activity', value: lastActiveWf ? formatDate(lastActiveWf.lastRun.createdAt) : '—', sub: 'most recent run' },
        ].map((s, i) => (
          <div key={s.label} className={`flex-1 px-4 py-3${i > 0 ? ' border-l border-[#e6e8eb]' : ''}`}>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{s.label}</p>
            <p className="mt-1 text-[18px] font-semibold leading-none tabular-nums tracking-tight text-[#0f1011]">{s.value}</p>
            <p className="mt-1.5 text-[11px] text-[#8a8f98]">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Workflow list */}
      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Registered</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; {workflows.length} workflow{workflows.length !== 1 ? 's' : ''} defined in code</p>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
          {/* Column header */}
          <div className="grid grid-cols-[1fr_auto_80px_160px] items-center border-b border-[#e6e8eb] bg-[#fafbfb] px-4">
            <div className="h-9 flex items-center text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Workflow</div>
            <div className="h-9 flex items-center text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Triggers</div>
            <div className="h-9 flex items-center justify-end text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Runs</div>
            <div className="h-9 flex items-center justify-end text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Last run</div>
          </div>

          {workflows.length === 0 ? (
            <EmptyState
              title="No workflows registered"
              description="Define workflows in shared/workflows/src/workflows/"
              data-testid="workflows-empty"
            />
          ) : (
            <div className="divide-y divide-[#eff0f2]">
              {workflows.map((wf: any) => (
                <Link
                  key={wf.key}
                  href={`/workflows/${encodeURIComponent(wf.key)}`}
                  className="group grid grid-cols-[1fr_auto_80px_160px] items-center px-4 h-11 hover:bg-[#fafbfb] transition-colors duration-100"
                  data-testid={`row-workflow-${wf.key}`}
                >
                  <div className="min-w-0">
                    <span className="text-[12.5px] font-medium text-[#0f1011] truncate">{wf.name}</span>
                    {wf.description && (
                      <span className="ml-2 text-[11px] text-[#8a8f98] truncate hidden sm:inline">{wf.description}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 px-3">
                    {(wf.triggers ?? []).map((t: any, i: number) => (
                      <TriggerChip key={i} type={t.type} />
                    ))}
                    {wf.category && (
                      <Badge tone="neutral" className="text-[10px]">{wf.category}</Badge>
                    )}
                  </div>
                  <div className="text-right text-[12px] tabular-nums text-[#62666d]">
                    {wf.runCount ?? 0}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {wf.lastRun ? (
                      <>
                        <StatusDot tone={statusDotTone(wf.lastRun.status)} label={wf.lastRun.status} />
                        <span className="text-[11px] text-[#8a8f98]">{formatDate(wf.lastRun.createdAt)}</span>
                      </>
                    ) : (
                      <span className="text-[11px] text-[#8a8f98]">never run</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
