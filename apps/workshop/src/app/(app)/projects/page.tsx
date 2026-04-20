import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { createServiceContext, listProjects, countProjects, countTasks } from '@hq/services';
import { Button, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ProjectsOverviewPage() {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const ctx = createServiceContext(principal);

  const [projects, totalProjects, totalTasks, blocked] = await Promise.all([
    listProjects(ctx, { limit: 50, sortBy: 'updatedAt', sortDir: 'desc' }),
    countProjects(ctx),
    countTasks(ctx),
    countTasks(ctx, { status: 'BLOCKED' }),
  ]);

  return (
    <div className="space-y-4" data-testid="projects-overview">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
            <span className="font-medium">Home</span>
            <span className="text-[#d0d6e0]">/</span>
            <span>Projects</span>
          </div>
          <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Projects</h1>
          <p className="mt-2 text-[12.5px] text-[#62666d]">
            Projects and tasks assigned to canonical users.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 pt-1">
          <Link href="/projects/new" data-testid="new-project-link">
            <Button variant="primary" size="sm">New project</Button>
          </Link>
        </div>
      </div>

      {/* Stat row */}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" data-testid="projects-tiles">
        {[
          { label: 'Projects', value: totalProjects, href: '/projects/portfolio' },
          { label: 'Tasks', value: totalTasks, href: '/projects/blocked' },
          { label: 'Blocked', value: blocked, href: '/projects/blocked' },
          { label: 'Portfolio', value: '→', href: '/projects/portfolio' },
        ].map((t, i) => (
          <Link
            key={t.label}
            href={t.href}
            className={`flex-1 px-4 py-3 hover:bg-[#fafbfb] transition-colors duration-100${i > 0 ? ' border-l border-[#e6e8eb]' : ''}`}
            data-testid={`tile-${t.label.toLowerCase()}`}
          >
            <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{t.label}</p>
            <p className="mt-1 text-[18px] font-semibold leading-none tabular-nums tracking-tight text-[#0f1011]">{t.value}</p>
          </Link>
        ))}
      </div>

      {/* Recent projects */}
      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Recent projects</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; {projects.items.length} latest</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
          {projects.items.length === 0 ? (
            <EmptyState title="No projects yet" action={<Link href="/projects/new"><Button variant="primary" size="sm">New project</Button></Link>} />
          ) : (
            <div className="divide-y divide-[#eff0f2]" data-testid="recent-projects">
              {projects.items.map((p: any) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="group flex h-11 items-center justify-between gap-3 px-4 hover:bg-[#fafbfb] transition-colors duration-100"
                  data-testid={`project-link-${p.id}`}
                >
                  <span className="text-[12.5px] font-medium text-[#0f1011]">{p.name}</span>
                  <span className="text-[11px] uppercase tracking-[0.04em] text-[#8a8f98]">{p.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
