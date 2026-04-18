import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { dispatchAction } from '@hq/actions';

export const dynamic = 'force-dynamic';

export default async function BlockedTasksPage() {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);

  const outcome = await dispatchAction('task.listBlocked', { limit: 100 }, principal);
  const tasks: any[] = outcome.ok && 'result' in outcome ? (outcome.result as any).tasks ?? [] : [];

  return (
    <div className="flex h-full flex-col" data-testid="projects-blocked">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--fg)]">Blocked tasks</h1>
          <p className="mt-0.5 text-[13px] text-[var(--muted)]">
            Every task currently in BLOCKED state — sorted by most recently updated.
          </p>
        </div>
        <Link
          href="/projects"
          className="text-[13px] font-medium text-[var(--accent)] hover:underline"
        >
          ← Back to overview
        </Link>
      </div>

      <table className="w-full text-[13px]" data-testid="blocked-table">
        <thead className="bg-[var(--surface)]">
          <tr className="text-left text-[12px] uppercase tracking-wide text-[var(--muted)]">
            <th className="px-6 py-2">Task</th>
            <th className="px-3 py-2">Project</th>
            <th className="px-3 py-2">Assignee</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2">Priority</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {tasks.map((t) => (
            <tr key={t.id} data-testid={`blocked-row-${t.id}`}>
              <td className="px-6 py-2">
                <Link href={`/objects/Task/${t.id}`} className="font-medium text-[var(--fg)] hover:underline">
                  {t.title}
                </Link>
              </td>
              <td className="px-3 py-2">
                {t.project ? (
                  <Link href={`/objects/Project/${t.project.id}`} className="text-[var(--muted)] hover:underline">
                    {t.project.name}
                  </Link>
                ) : (
                  <span className="text-[var(--muted)]">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <span className="text-[var(--muted)]">
                  {t.assignee?.name ?? t.assignee?.email ?? 'Unassigned'}
                </span>
              </td>
              <td className="px-3 py-2 text-[var(--fg)]">{t.blockedReason ?? '—'}</td>
              <td className="px-3 py-2 uppercase text-[12px] text-[var(--muted)]">{t.priority}</td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-4 text-[13px] text-[var(--muted)]">
                Nothing is blocked right now. 🎉
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
