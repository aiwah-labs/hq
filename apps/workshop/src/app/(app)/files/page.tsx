import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { listFolders, searchFiles } from '@hq/files';
import { createServiceContext } from '@hq/services';
import { EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

interface FileRow {
  id: string; name: string; mime: string | null;
  size: number | null; uploadedAt: string | Date | null;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(d: string | Date | null): string {
  if (!d) return 'Pending';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default async function FilesPage() {
  const principal = await requirePermission(ROUTE_PERMISSIONS.files);
  const ctx = createServiceContext(principal);

  const rootFolders = await listFolders(ctx, { parentId: null });
  const recentRaw = await searchFiles(ctx, { limit: 12 });
  const recent = recentRaw.items as FileRow[];

  return (
    <div className="space-y-4" data-testid="files-page">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <span>Files</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Files</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">Folders all the way down. Upload anywhere, search everywhere.</p>
      </div>

      {/* Top-level folders */}
      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Folders</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; {rootFolders.length} top-level</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" aria-labelledby="folders-heading">
          {rootFolders.length === 0 ? (
            <EmptyState
              title="No folders yet"
              description="Create one by seeding system folders or via the API."
              data-testid="no-folders"
            />
          ) : (
            <div className="divide-y divide-[#eff0f2]" data-testid="folder-list">
              {rootFolders.map((folder) => (
                <Link
                  key={folder.id}
                  href={`/files/f/${folder.id}`}
                  data-testid={`folder-card-${folder.id}`}
                  className="group flex h-11 items-center gap-3 px-4 hover:bg-[#fafbfb] transition-colors duration-100"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-[#8a8f98]" aria-hidden="true">
                    <path d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3l1 1.5h4.5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[12.5px] font-medium text-[#0f1011]">{folder.name}</span>
                  <span className="ml-1 text-[11px] font-mono text-[#8a8f98]">{folder.path}</span>
                  <span className="ml-auto text-[11px] text-[#8a8f98]">{folder.kind}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent files */}
      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Recent files</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; last {recent.length}</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" aria-labelledby="recent-heading">
          {recent.length === 0 ? (
            <EmptyState title="No files uploaded yet" data-testid="no-files" />
          ) : (
            <>
              <div className="grid grid-cols-[1fr_120px_80px_140px] border-b border-[#e6e8eb] bg-[#fafbfb] px-4">
                {['Name', 'Type', 'Size', 'Uploaded'].map((h) => (
                  <div key={h} className="h-9 flex items-center text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{h}</div>
                ))}
              </div>
              <div className="divide-y divide-[#eff0f2]" data-testid="recent-files-table">
                {recent.map((file) => (
                  <div key={file.id} className="grid grid-cols-[1fr_120px_80px_140px] items-center px-4 h-10 hover:bg-[#fafbfb] transition-colors duration-100">
                    <Link
                      href={`/files/file/${file.id}`}
                      data-testid={`file-row-${file.id}`}
                      className="text-[12.5px] font-medium text-[#0f1011] hover:text-[#009E85] transition-colors truncate"
                    >
                      {file.name}
                    </Link>
                    <span className="font-mono text-[11px] text-[#8a8f98] truncate">{file.mime ?? '—'}</span>
                    <span className="text-[12px] tabular-nums text-[#62666d]">{formatBytes(file.size)}</span>
                    <span className="text-[11px] tabular-nums text-[#8a8f98]">{formatDate(file.uploadedAt)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
