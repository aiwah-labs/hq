import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { objectList } from '@hq/objects';
import { createServiceContext } from '@hq/services';
import { dispatchAction } from '@hq/actions';

export const dynamic = 'force-dynamic';

export default async function ProjectsPortfolioPage() {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const ctx = createServiceContext(principal);

  const projects = await objectList('Project', { limit: 200, sortBy: 'updatedAt', sortDir: 'desc' }, ctx);

  // Pull per-project stats via the action dispatcher so permission checks run.
  const stats = await Promise.all(
    projects.items.map(async (p: any) => {
      const outcome = await dispatchAction('project.stats', { projectId: p.id }, principal);
      return outcome.ok ? (outcome.result as any) : null;
    }),
  );

  return (
    <div className="flex h-full flex-col" data-testid="projects-portfolio">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--fg)]">Portfolio</h1>
          <p className="mt-0.5 text-[13px] text-[var(--muted)]">
            Every project with rolled-up task counts.
          </p>
        </div>
        <Link
          href="/projects"
          className="text-[13px] font-medium text-[var(--accent)] hover:underline"
        >
          ← Back to overview
        </Link>
      </div>
      <table className="w-full text-[13px]" data-testid="portfolio-table">
        <thead className="bg-[var(--surface)]">
          <tr className="text-left text-[12px] uppercase tracking-wide text-[var(--muted)]">
            <th className="px-6 py-2">Project</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2 text-right">Tasks</th>
            <th className="px-3 py-2 text-right">Done</th>
            <th className="px-3 py-2 text-right">Blocked</th>
            <th className="px-3 py-2 text-right">Overdue</th>
            <th className="px-3 py-2 text-right">Completion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {projects.items.map((p: any, i: number) => {
            const s = stats[i];
            const pct = s?.completion != null ? Math.round(s.completion * 100) : 0;
            return (
              <tr key={p.id} data-testid={`portfolio-row-${p.id}`}>
                <td className="px-6 py-2">
                  <Link href={`/objects/Project/${p.id}`} className="font-medium text-[var(--fg)] hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2 uppercase text-[12px] text-[var(--muted)]">{p.status}</td>
                <td className="px-3 py-2 uppercase text-[12px] text-[var(--muted)]">{p.priority}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s?.counts?.total ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s?.counts?.done ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s?.counts?.blocked ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s?.counts?.overdue ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct}%</td>
              </tr>
            );
          })}
          {projects.items.length === 0 && (
            <tr>
              <td colSpan={8} className="px-6 py-4 text-[13px] text-[var(--muted)]">No projects.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
