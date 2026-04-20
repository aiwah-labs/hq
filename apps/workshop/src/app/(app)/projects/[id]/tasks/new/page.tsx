import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { db } from '@hq/db';
import { Button } from '@/components/ui';
import { createTaskAction } from '../../actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewTaskPage({ params }: Props) {
  await requirePermission(ROUTE_PERMISSIONS.workshop);
  const { id } = await params;

  const project = await db.project.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!project) notFound();

  return (
    <div className="space-y-4" data-testid="new-task-page">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <Link href="/projects" className="hover:text-[#0f1011] transition-colors">Projects</Link>
          <span className="text-[#d0d6e0]">/</span>
          <Link href={`/projects/${project.id}`} className="hover:text-[#0f1011] transition-colors max-w-[160px] truncate">{project.name}</Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>New task</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">New task</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">Adding to <span className="font-medium text-[#0f1011]">{project.name}</span>.</p>
      </div>

      <form action={createTaskAction} className="space-y-4">
        <input type="hidden" name="projectId" value={project.id} />

        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
          <div className="divide-y divide-[#eff0f2]">
            {/* Title */}
            <div className="grid grid-cols-[180px_1fr] items-start gap-4 px-4 py-3.5">
              <label htmlFor="title" className="pt-0.5 text-[12.5px] font-medium text-[#3d4149]">
                Task title <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="e.g. Write first draft"
                autoFocus
                className="w-full rounded-md border border-[#e6e8eb] bg-white px-3 py-1.5 text-[12.5px] text-[#0f1011] placeholder-[#c4c8cf] outline-none transition-colors focus:border-[#009E85] focus:ring-2 focus:ring-[#009E85]/20"
              />
            </div>

            {/* Priority */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4 px-4 py-3.5">
              <label htmlFor="priority" className="text-[12.5px] font-medium text-[#3d4149]">Priority</label>
              <select
                id="priority"
                name="priority"
                defaultValue="MEDIUM"
                className="w-40 rounded-md border border-[#e6e8eb] bg-white px-3 py-1.5 text-[12.5px] text-[#0f1011] outline-none transition-colors focus:border-[#009E85] focus:ring-2 focus:ring-[#009E85]/20"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            {/* Due in days */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4 px-4 py-3.5">
              <label htmlFor="dueInDays" className="text-[12.5px] font-medium text-[#3d4149]">
                Due (days from now)
              </label>
              <input
                id="dueInDays"
                name="dueInDays"
                type="number"
                min="1"
                max="365"
                placeholder="e.g. 7"
                className="w-40 rounded-md border border-[#e6e8eb] bg-white px-3 py-1.5 text-[12.5px] text-[#0f1011] placeholder-[#c4c8cf] outline-none transition-colors focus:border-[#009E85] focus:ring-2 focus:ring-[#009E85]/20"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm">Add task</Button>
          <Link href={`/projects/${project.id}`}>
            <Button type="button" variant="ghost" size="sm">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
