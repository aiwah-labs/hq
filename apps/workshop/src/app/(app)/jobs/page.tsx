import { db } from '@hq/db';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';
import { StatusDot, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

const stateMap: Record<string, { tone: 'success' | 'danger' | 'neutral' | 'warn'; label: string }> = {
  completed: { tone: 'success', label: 'Completed' },
  failed:    { tone: 'danger',  label: 'Failed' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
  active:    { tone: 'brand' as any, label: 'Active' },
  created:   { tone: 'warn',   label: 'Created' },
  retry:     { tone: 'warn',   label: 'Retry' },
  expired:   { tone: 'neutral', label: 'Expired' },
};

function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default async function JobsPage() {
  await requirePermission(PERMISSIONS.adminSurface);

  let jobs: any[] = [];
  let schedules: any[] = [];
  try {
    jobs = await db.$queryRaw<any[]>`
      SELECT id, name, state, createdon, startedon, completedon, retrycount, output
      FROM pgboss.job
      ORDER BY createdon DESC
      LIMIT 100
    `;
    schedules = await db.$queryRaw<any[]>`
      SELECT name, cron, timezone, created_on
      FROM pgboss.schedule
      ORDER BY name
    `;
  } catch {
    // pg-boss schema not yet initialised — show empty state
  }

  return (
    <div className="space-y-4" data-testid="jobs-page">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <span>Jobs</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Jobs</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          Background job runs and recurring schedules powered by pg-boss.
        </p>
      </div>

      {/* Schedules */}
      <div data-testid="schedules-section">
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Schedules</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; {schedules.length} registered</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
          {schedules.length === 0 ? (
            <EmptyState title="No schedules registered" description="Recurring jobs will appear here once pg-boss starts." />
          ) : (
            <>
              <div className="grid grid-cols-[1fr_120px_100px] border-b border-[#e6e8eb] bg-[#fafbfb] px-4">
                {['Name', 'Cron', 'Timezone'].map((h) => (
                  <div key={h} className="h-9 flex items-center text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{h}</div>
                ))}
              </div>
              <div className="divide-y divide-[#eff0f2]">
                {schedules.map((s) => (
                  <div key={s.name} className="grid grid-cols-[1fr_120px_100px] items-center px-4 h-9">
                    <span className="font-mono text-[12px] text-[#0f1011]">{s.name}</span>
                    <span className="font-mono text-[12px] text-[#62666d]">{s.cron}</span>
                    <span className="text-[12px] text-[#62666d]">{s.timezone ?? 'UTC'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent job runs */}
      <div data-testid="job-runs-section">
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Recent runs</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; last {jobs.length}</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" data-testid="job-runs-table">
          {jobs.length === 0 ? (
            <EmptyState title="No job runs yet" description="Jobs appear here once pg-boss processes its first job." />
          ) : (
            <>
              <div className="grid grid-cols-[100px_1fr_140px_140px_60px] border-b border-[#e6e8eb] bg-[#fafbfb] px-4">
                {['State', 'Name', 'Created', 'Completed', 'Retries'].map((h) => (
                  <div key={h} className="h-9 flex items-center text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{h}</div>
                ))}
              </div>
              <div className="divide-y divide-[#eff0f2]">
                {jobs.map((j) => {
                  const s = stateMap[j.state] ?? { tone: 'neutral', label: j.state };
                  return (
                    <div key={j.id} className="grid grid-cols-[100px_1fr_140px_140px_60px] items-center px-4 h-10 hover:bg-[#fafbfb] transition-colors duration-100" data-testid={`job-${j.id}`}>
                      <StatusDot tone={s.tone as any} label={s.label} />
                      <span className="font-mono text-[12px] text-[#0f1011] truncate">{j.name}</span>
                      <span className="font-mono text-[11px] tabular-nums text-[#62666d]">{formatDate(j.createdon)}</span>
                      <span className="font-mono text-[11px] tabular-nums text-[#62666d]">{formatDate(j.completedon)}</span>
                      <span className="text-right font-mono text-[12px] tabular-nums text-[#62666d]">{j.retrycount ?? 0}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
