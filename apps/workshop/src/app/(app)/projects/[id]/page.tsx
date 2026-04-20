import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { db } from '@hq/db';
import { dispatchAction } from '@hq/actions';
import { Badge, StatusDot, Button, EmptyState } from '@/components/ui';
import {
  completeTaskAction,
  markTaskInProgressAction,
  createTaskAction,
  updateProjectStatusAction,
} from './actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

const statusTone = {
  PLANNED: 'neutral',
  ACTIVE: 'brand',
  BLOCKED: 'danger',
  DONE: 'success',
  CANCELLED: 'neutral',
} as const;

const priorityTone = {
  LOW: 'neutral',
  MEDIUM: 'neutral',
  HIGH: 'warn',
  URGENT: 'danger',
} as const;

const taskStatusTone = {
  TODO: 'neutral',
  IN_PROGRESS: 'indigo',
  BLOCKED: 'danger',
  DONE: 'success',
  CANCELLED: 'neutral',
} as const;

function formatDate(d: Date | null): string {
  if (!d) return '—';
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.round(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days <= 14) return `in ${days}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(d: Date | null, status: string): boolean {
  if (!d || status === 'DONE' || status === 'CANCELLED') return false;
  return d < new Date();
}

const KANBAN_COLS = [
  { status: 'TODO', label: 'To do' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'BLOCKED', label: 'Blocked' },
  { status: 'DONE', label: 'Done' },
] as const;

export default async function ProjectDetailPage({ params }: Props) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const { id } = await params;

  const project = await db.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      tasks: {
        include: { assignee: { select: { id: true, name: true, email: true } } },
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }],
      },
    },
  });

  if (!project) notFound();

  const statsOutcome = await dispatchAction('project.stats', { projectId: id }, principal);
  const stats = statsOutcome.ok ? (statsOutcome.result as any) : null;

  const tasksByStatus = Object.fromEntries(
    KANBAN_COLS.map((col) => [
      col.status,
      project.tasks.filter((t) => t.status === col.status),
    ]),
  ) as Record<string, typeof project.tasks>;

  const activeTasks = project.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
  const inboxItems = await db.inboxItem.findMany({
    where: { sourceType: 'Project', sourceId: id, status: { not: 'ARCHIVED' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const pct = stats?.completion != null ? Math.round(stats.completion * 100) : 0;

  return (
    <div className="space-y-5" data-testid="project-detail">
      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
            <span className="font-medium">Home</span>
            <span className="text-[#d0d6e0]">/</span>
            <Link href="/projects" className="hover:text-[#0f1011] transition-colors">Projects</Link>
            <span className="text-[#d0d6e0]">/</span>
            <span className="max-w-[160px] truncate">{project.name}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">
              {project.name}
            </h1>
            <StatusDot tone={statusTone[project.status]} label={project.status} />
            <Badge tone={priorityTone[project.priority]}>{project.priority}</Badge>
          </div>
          {project.summary && (
            <p className="mt-2 text-[12.5px] text-[#62666d] max-w-2xl">{project.summary}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2 pt-1">
          {/* Status update */}
          {project.status !== 'DONE' && project.status !== 'CANCELLED' && (
            <form action={updateProjectStatusAction.bind(null, project.id, 'DONE')}>
              <Button type="submit" variant="outline" size="sm">Mark done</Button>
            </form>
          )}
          <Link href={`/projects/new?from=${project.id}`} data-testid="new-project-link">
            <Button variant="outline" size="sm">New project</Button>
          </Link>
        </div>
      </div>

      {/* Meta strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-[#e6e8eb] bg-white px-4 py-3 text-[12px]">
        <div className="flex items-center gap-1.5 text-[#62666d]">
          <span className="text-[#8a8f98]">Owner</span>
          <span className="font-medium text-[#0f1011]">
            {project.owner?.name ?? project.owner?.email ?? 'Unassigned'}
          </span>
        </div>
        {project.startDate && (
          <div className="flex items-center gap-1.5 text-[#62666d]">
            <span className="text-[#8a8f98]">Start</span>
            <span>{new Date(project.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        )}
        {project.targetDate && (
          <div className="flex items-center gap-1.5 text-[#62666d]">
            <span className="text-[#8a8f98]">Target</span>
            <span className={isOverdue(project.targetDate, project.status) ? 'text-red-600 font-medium' : ''}>
              {new Date(project.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[#62666d]">
          <span className="text-[#8a8f98]">Tasks</span>
          <span>{activeTasks.length} open · {stats?.counts?.done ?? 0} done</span>
        </div>
      </div>

      {/* Progress bar */}
      {(stats?.counts?.total ?? 0) > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Progress</span>
            <span className="text-[11px] tabular-nums text-[#8a8f98]">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#f3f4f5]">
            <div
              className="h-full rounded-full bg-[#009E85] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats tiles */}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" data-testid="project-stats">
        {[
          { label: 'Total', value: stats?.counts?.total ?? 0 },
          { label: 'Done', value: stats?.counts?.done ?? 0 },
          { label: 'Blocked', value: stats?.counts?.blocked ?? 0 },
          { label: 'Overdue', value: stats?.counts?.overdue ?? 0 },
        ].map((t, i) => (
          <div
            key={t.label}
            className={`flex-1 px-4 py-3${i > 0 ? ' border-l border-[#e6e8eb]' : ''}`}
          >
            <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{t.label}</p>
            <p className={`mt-1 text-[18px] font-semibold leading-none tabular-nums tracking-tight${t.label === 'Blocked' && t.value > 0 ? ' text-amber-600' : t.label === 'Overdue' && t.value > 0 ? ' text-red-600' : ' text-[#0f1011]'}`}>
              {t.value}
            </p>
          </div>
        ))}
      </div>

      {/* Kanban board */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Board</h2>
          <Link href={`/projects/${project.id}/tasks/new`} data-testid="new-task-link">
            <Button variant="primary" size="xs">+ Add task</Button>
          </Link>
        </div>

        <div className="grid grid-cols-4 gap-3" data-testid="kanban-board">
          {KANBAN_COLS.map((col) => {
            const colTasks = tasksByStatus[col.status] ?? [];
            return (
              <div key={col.status} className="flex flex-col" data-testid={`kanban-col-${col.status.toLowerCase()}`}>
                {/* Column header */}
                <div className="mb-2 flex items-center gap-1.5">
                  <StatusDot
                    tone={taskStatusTone[col.status]}
                    label={col.label}
                    className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                  />
                  <span className="ml-auto text-[11px] tabular-nums text-[#8a8f98]">{colTasks.length}</span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 rounded-lg bg-[#fafbfb] p-2 min-h-[80px]">
                  {colTasks.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center py-4">
                      <span className="text-[11px] text-[#c4c8cf]">Empty</span>
                    </div>
                  ) : (
                    colTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-md border border-[#e6e8eb] bg-white p-3 shadow-[0_1px_2px_0_rgba(0,0,0,0.04)]"
                        data-testid={`task-card-${task.id}`}
                      >
                        <p className="text-[12.5px] font-medium leading-snug text-[#0f1011]">
                          {task.title}
                        </p>

                        {task.blockedReason && (
                          <p className="mt-1 text-[11px] text-red-600 leading-snug">
                            ⚠ {task.blockedReason}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge tone={priorityTone[task.priority]}>{task.priority}</Badge>
                          {task.dueAt && (
                            <span className={`text-[10.5px] tabular-nums ${isOverdue(task.dueAt, task.status) ? 'text-red-600 font-medium' : 'text-[#8a8f98]'}`}>
                              {formatDate(task.dueAt)}
                            </span>
                          )}
                          {task.assignee && (
                            <span className="text-[10.5px] text-[#8a8f98]">
                              {task.assignee.name ?? task.assignee.email}
                            </span>
                          )}
                        </div>

                        {/* Quick actions */}
                        <div className="mt-2.5 flex items-center gap-1.5">
                          {task.status !== 'DONE' && task.status !== 'CANCELLED' && (
                            <form action={completeTaskAction.bind(null, task.id, project.id)}>
                              <button
                                type="submit"
                                aria-label="Mark task done"
                                className="text-[11px] font-medium text-[#009E85] hover:text-[#007A66] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009E85]/40"
                              >
                                Complete
                              </button>
                            </form>
                          )}
                          {task.status === 'TODO' && (
                            <form action={markTaskInProgressAction.bind(null, task.id, project.id)}>
                              <button
                                type="submit"
                                aria-label="Start task"
                                className="text-[11px] text-[#62666d] hover:text-[#0f1011] transition-colors focus-visible:outline-none"
                              >
                                Start
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inbox items linked to this project */}
      {inboxItems.length > 0 && (
        <div>
          <div className="mb-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Activity</h2>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white divide-y divide-[#eff0f2]">
            {inboxItems.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3" data-testid={`project-inbox-${item.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-[#0f1011]">{item.title}</p>
                  {item.body && <p className="mt-0.5 text-[12px] text-[#62666d]">{item.body}</p>}
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-[#8a8f98]">
                  {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancelled tasks (collapsed) */}
      {project.tasks.filter((t) => t.status === 'CANCELLED').length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] text-[#8a8f98] hover:text-[#3d4149] transition-colors list-none flex items-center gap-1.5">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            {project.tasks.filter((t) => t.status === 'CANCELLED').length} cancelled task{project.tasks.filter((t) => t.status === 'CANCELLED').length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 overflow-hidden rounded-lg border border-[#e6e8eb] bg-white divide-y divide-[#eff0f2]">
            {project.tasks.filter((t) => t.status === 'CANCELLED').map((task) => (
              <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[12.5px] text-[#8a8f98] line-through">{task.title}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Add first task prompt */}
      {project.tasks.length === 0 && (
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
          <EmptyState
            title="No tasks yet"
            description="Break this project down into tasks to track progress."
            action={
              <Link href={`/projects/${project.id}/tasks/new`}>
                <Button variant="primary" size="sm">Add first task</Button>
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
