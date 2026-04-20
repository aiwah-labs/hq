import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { dispatchAction } from '@hq/actions';
import { EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function BlockedTasksPage() {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);

  const outcome = await dispatchAction('task.listBlocked', { limit: 100 }, principal);
  const tasks: any[] = outcome.ok && 'result' in outcome ? (outcome.result as any).tasks ?? [] : [];

  return (
    <div className="space-y-4" data-testid="projects-blocked">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <Link href="/projects" className="hover:text-[#0f1011] transition-colors">Projects</Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>Blocked</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Blocked tasks</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          Every task currently in BLOCKED state — sorted by most recently updated.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        {tasks.length === 0 ? (
          <EmptyState title="Nothing is blocked right now" description="All tasks are moving freely." />
        ) : (
          <table className="w-full text-[13px]" data-testid="blocked-table">
            <thead>
              <tr className="border-b border-[#e6e8eb] bg-[#fafbfb] text-left">
                <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Task</th>
                <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Project</th>
                <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Assignee</th>
                <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Reason</th>
                <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff0f2]">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-[#fafbfb] transition-colors duration-100" data-testid={`blocked-row-${t.id}`}>
                  <td className="px-4 py-2.5">
                    <Link href={`/projects/${t.project?.id ?? ''}`} className="text-[12.5px] font-medium text-[#0f1011] hover:text-[#009E85] transition-colors">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    {t.project ? (
                      <Link href={`/projects/${t.project.id}`} className="text-[12px] text-[#62666d] hover:text-[#0f1011] transition-colors">
                        {t.project.name}
                      </Link>
                    ) : (
                      <span className="text-[12px] text-[#8a8f98]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[#62666d]">
                    {t.assignee?.name ?? t.assignee?.email ?? 'Unassigned'}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[#0f1011]">{t.blockedReason ?? '—'}</td>
                  <td className="px-3 py-2.5 text-[11px] uppercase tracking-[0.04em] text-[#62666d]">{t.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
