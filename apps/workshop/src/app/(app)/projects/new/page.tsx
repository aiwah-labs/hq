import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { Button } from '@/components/ui';
import { createProjectAction } from '../[id]/actions';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  await requirePermission(ROUTE_PERMISSIONS.workshop);

  return (
    <div className="space-y-4" data-testid="new-project-page">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <Link href="/projects" className="hover:text-[#0f1011] transition-colors">Projects</Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>New project</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">New project</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">Create a project to organise and track related tasks.</p>
      </div>

      <form action={createProjectAction} className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
          <div className="divide-y divide-[#eff0f2]">
            {/* Name */}
            <div className="grid grid-cols-[180px_1fr] items-start gap-4 px-4 py-3.5">
              <label htmlFor="name" className="pt-0.5 text-[12.5px] font-medium text-[#3d4149]">
                Project name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="e.g. Launch revenue engine"
                autoFocus
                className="w-full rounded-md border border-[#e6e8eb] bg-white px-3 py-1.5 text-[12.5px] text-[#0f1011] placeholder-[#c4c8cf] outline-none transition-colors focus:border-[#009E85] focus:ring-2 focus:ring-[#009E85]/20"
              />
            </div>

            {/* Summary */}
            <div className="grid grid-cols-[180px_1fr] items-start gap-4 px-4 py-3.5">
              <label htmlFor="summary" className="pt-0.5 text-[12.5px] font-medium text-[#3d4149]">
                Summary
              </label>
              <textarea
                id="summary"
                name="summary"
                rows={3}
                placeholder="One sentence on what this project delivers and why it matters."
                className="w-full resize-none rounded-md border border-[#e6e8eb] bg-white px-3 py-1.5 text-[12.5px] text-[#0f1011] placeholder-[#c4c8cf] outline-none transition-colors focus:border-[#009E85] focus:ring-2 focus:ring-[#009E85]/20"
              />
            </div>

            {/* Status */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4 px-4 py-3.5">
              <label htmlFor="status" className="text-[12.5px] font-medium text-[#3d4149]">Status</label>
              <select
                id="status"
                name="status"
                defaultValue="PLANNED"
                className="w-40 rounded-md border border-[#e6e8eb] bg-white px-3 py-1.5 text-[12.5px] text-[#0f1011] outline-none transition-colors focus:border-[#009E85] focus:ring-2 focus:ring-[#009E85]/20"
              >
                <option value="PLANNED">Planned</option>
                <option value="ACTIVE">Active</option>
                <option value="BLOCKED">Blocked</option>
              </select>
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

            {/* Target date */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4 px-4 py-3.5">
              <label htmlFor="targetInDays" className="text-[12.5px] font-medium text-[#3d4149]">
                Target (days from now)
              </label>
              <input
                id="targetInDays"
                name="targetInDays"
                type="number"
                min="1"
                max="365"
                placeholder="e.g. 30"
                className="w-40 rounded-md border border-[#e6e8eb] bg-white px-3 py-1.5 text-[12.5px] text-[#0f1011] placeholder-[#c4c8cf] outline-none transition-colors focus:border-[#009E85] focus:ring-2 focus:ring-[#009E85]/20"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm">Create project</Button>
          <Link href="/projects">
            <Button type="button" variant="ghost" size="sm">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
