import { db } from '@hq/db';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';

export const dynamic = 'force-dynamic';

function StateBadge({ state }: { state: string }) {
  const colorMap: Record<string, string> = {
    completed: 'bg-emerald-500/15 text-emerald-400',
    failed: 'bg-red-500/15 text-red-400',
    cancelled: 'bg-neutral-500/15 text-neutral-400',
    active: 'bg-blue-500/15 text-blue-400',
    created: 'bg-amber-500/15 text-amber-400',
    retry: 'bg-amber-500/15 text-amber-400',
    expired: 'bg-neutral-500/15 text-neutral-400',
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${colorMap[state] ?? 'bg-neutral-500/15 text-neutral-400'}`}>
      {state.toUpperCase()}
    </span>
  );
}

export default async function JobsPage() {
  await requirePermission(PERMISSIONS.adminSurface);

  // pg-boss stores jobs in the pgboss schema — read directly via raw SQL
  // since Prisma doesn't manage the pgboss schema.
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
    <div className="space-y-8 p-6" data-testid="jobs-page">
      <div>
        <h1 className="text-[20px] font-semibold text-[var(--fg)]">Jobs</h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Background job runs and recurring schedules powered by pg-boss.
        </p>
      </div>

      {/* Schedules */}
      <section data-testid="schedules-section">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">Schedules</h2>
        {schedules.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--muted)]">
            No recurring schedules registered.
          </p>
        ) : (
          <table className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Name</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Cron</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Timezone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {schedules.map((s) => (
                <tr key={s.name}>
                  <td className="px-4 py-2 font-mono text-[var(--fg)]">{s.name}</td>
                  <td className="px-4 py-2 font-mono text-[var(--muted)]">{s.cron}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">{s.timezone ?? 'UTC'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent job runs */}
      <section data-testid="job-runs-section">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">Recent Job Runs</h2>
        {jobs.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--muted)]">
            No job runs yet. Jobs appear here once pg-boss starts and processes the first job.
          </p>
        ) : (
          <table className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] text-[13px]" data-testid="job-runs-table">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">State</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Name</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Created</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Completed</th>
                <th className="px-4 py-2 text-right font-medium text-[var(--muted)]">Retries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {jobs.map((j) => (
                <tr key={j.id} data-testid={`job-${j.id}`}>
                  <td className="px-4 py-2"><StateBadge state={j.state} /></td>
                  <td className="px-4 py-2 font-mono text-[var(--fg)]">{j.name}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-[var(--muted)]">{j.createdon ? new Date(j.createdon).toLocaleString() : '—'}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-[var(--muted)]">{j.completedon ? new Date(j.completedon).toLocaleString() : '—'}</td>
                  <td className="px-4 py-2 text-right font-mono text-[12px] text-[var(--muted)]">{j.retrycount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
