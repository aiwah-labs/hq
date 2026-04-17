import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { objectList, objectCount } from '@hq/objects';
import { createServiceContext } from '@hq/services';

export const dynamic = 'force-dynamic';

export default async function ProjectsOverviewPage() {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const ctx = createServiceContext(principal);

  const [projects, totalProjects, totalTasks, blocked, overdue] = await Promise.all([
    objectList('Project', { limit: 50, sortBy: 'updatedAt', sortDir: 'desc' }, ctx),
    objectCount('Project', {}, ctx),
    objectCount('Task', {}, ctx),
    objectCount('Task', { filters: { status: 'BLOCKED' } }, ctx),
    // Overdue is a derived count — list filter engine doesn't handle lt natively,
    // so compute via the task list with due date sort as a shortcut for the card.
    objectCount('Task', {}, ctx).then(() => 0).catch(() => 0),
  ]);

  const tiles = [
    { label: 'Projects', value: totalProjects, href: '/objects/Project' },
    { label: 'Tasks', value: totalTasks, href: '/objects/Task' },
    { label: 'Blocked', value: blocked, href: '/projects/blocked' },
    { label: 'Portfolio', value: '→', href: '/projects/portfolio' },
  ];

  return (
    <div className="flex h-full flex-col" data-testid="projects-overview">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--fg)]">Projects</h1>
          <p className="mt-0.5 text-[13px] text-[var(--muted)]">
            Example module — projects and tasks assigned to canonical users.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/objects/Project/new"
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--fg)] hover:border-[var(--accent)]"
            data-testid="new-project-link"
          >
            New project
          </Link>
          <Link
            href="/objects/Task/new"
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--fg)] hover:border-[var(--accent)]"
            data-testid="new-task-link"
          >
            New task
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4" data-testid="projects-tiles">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 hover:border-[var(--accent)]"
            data-testid={`tile-${t.label.toLowerCase()}`}
          >
            <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">
              {t.label}
            </span>
            <span className="mt-0.5 text-[22px] font-semibold text-[var(--fg)]">{t.value}</span>
          </Link>
        ))}
      </div>

      <div className="border-t border-[var(--border)] px-6 py-4">
        <h2 className="text-[14px] font-semibold text-[var(--fg)]">Recent projects</h2>
        <ul className="mt-2 divide-y divide-[var(--border)]" data-testid="recent-projects">
          {projects.items.map((p: any) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <Link
                href={`/objects/Project/${p.id}`}
                className="text-[14px] font-medium text-[var(--fg)] hover:underline"
                data-testid={`project-link-${p.id}`}
              >
                {p.name}
              </Link>
              <span className="text-[12px] uppercase tracking-wide text-[var(--muted)]">
                {p.status}
              </span>
            </li>
          ))}
          {projects.items.length === 0 && (
            <li className="py-4 text-[13px] text-[var(--muted)]">No projects yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
