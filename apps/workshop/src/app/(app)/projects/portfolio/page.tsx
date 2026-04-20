import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { objectList } from '@hq/objects';
import { createServiceContext } from '@hq/services';
import { dispatchAction } from '@hq/actions';
import { EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ProjectsPortfolioPage() {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const ctx = createServiceContext(principal);

  const projects = await objectList('Project', { limit: 200, sortBy: 'updatedAt', sortDir: 'desc' }, ctx);

  const stats = await Promise.all(
    projects.items.map(async (p: any) => {
      const outcome = await dispatchAction('project.stats', { projectId: p.id }, principal);
      return outcome.ok ? (outcome.result as any) : null;
    }),
  );

  return (
    <div className="space-y-4" data-testid="projects-portfolio">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <Link href="/projects" className="hover:text-[#0f1011] transition-colors">Projects</Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>Portfolio</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Portfolio</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          Every project with rolled-up task counts.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        {projects.items.length === 0 ? (
          <EmptyState title="No projects yet" />
        ) : (
          <table className="w-full text-[13px]" data-testid="portfolio-table">
            <thead>
              <tr className="border-b border-[#e6e8eb] bg-[#fafbfb] text-left">
                <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Project</th>
                <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Status</th>
                <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Priority</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Tasks</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Done</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Blocked</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Overdue</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Done %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff0f2]">
              {projects.items.map((p: any, i: number) => {
                const s = stats[i];
                const pct = s?.completion != null ? Math.round(s.completion * 100) : 0;
                return (
                  <tr key={p.id} className="hover:bg-[#fafbfb] transition-colors duration-100" data-testid={`portfolio-row-${p.id}`}>
                    <td className="px-4 py-2.5">
                      <Link href={`/projects/${p.id}`} className="text-[12.5px] font-medium text-[#0f1011] hover:text-[#009E85] transition-colors">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] uppercase tracking-[0.04em] text-[#62666d]">{p.status}</td>
                    <td className="px-3 py-2.5 text-[11px] uppercase tracking-[0.04em] text-[#62666d]">{p.priority}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-[#0f1011]">{s?.counts?.total ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-[#62666d]">{s?.counts?.done ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-[#62666d]">{s?.counts?.blocked ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-[#62666d]">{s?.counts?.overdue ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-[#62666d]">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
