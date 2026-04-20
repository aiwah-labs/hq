import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getFolder, listFolders, searchFiles } from '@hq/files';
import { createServiceContext } from '@hq/services';
import { EmptyState } from '@/components/ui';
import { UploadForm } from './upload-form';

export const dynamic = 'force-dynamic';

interface FileRow {
  id: string;
  name: string;
  mime: string | null;
  size: number | null;
  uploadedAt: string | Date | null;
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

interface PageProps {
  params: Promise<{ folderId: string }>;
}

export default async function FolderPage({ params }: PageProps) {
  const { folderId } = await params;
  const principal = await requirePermission(ROUTE_PERMISSIONS.files);
  const ctx = createServiceContext(principal);

  let folder;
  try {
    folder = await getFolder(ctx, folderId);
  } catch {
    notFound();
  }

  const [subfolders, filesResult] = await Promise.all([
    listFolders(ctx, { parentId: folderId }),
    searchFiles(ctx, { folderId, limit: 200 }),
  ]);
  const files = filesResult.items as FileRow[];

  const segments = folder.path.split('/').filter(Boolean);

  return (
    <div className="space-y-4" data-testid="folder-page" data-folder-id={folder.id}>
      {/* Header */}
      <div>
        <nav aria-label="Breadcrumb" data-testid="breadcrumb" className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <Link href="/files" className="font-medium hover:text-[#0f1011] transition-colors">Files</Link>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-[#d0d6e0]">/</span>
              <span>{seg}</span>
            </span>
          ))}
        </nav>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">{folder.name}</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          {folder.path} · {folder.kind} · {subfolders.length} subfolder{subfolders.length !== 1 ? 's' : ''}, {files.length} file{files.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Upload */}
      <div>
        <div className="mb-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Upload</h2>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white p-4">
          <UploadForm folderId={folder.id} />
        </div>
      </div>

      {/* Subfolders */}
      {subfolders.length > 0 && (
        <div>
          <div className="mb-2.5 flex items-baseline gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Subfolders</h2>
            <p className="text-[11px] text-[#8a8f98]">&mdash; {subfolders.length}</p>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" data-testid="subfolder-list">
            <div className="divide-y divide-[#eff0f2]">
              {subfolders.map((sub) => (
                <Link
                  key={sub.id}
                  href={`/files/f/${sub.id}`}
                  data-testid={`folder-card-${sub.id}`}
                  className="flex h-11 items-center gap-3 px-4 hover:bg-[#fafbfb] transition-colors duration-100"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-[#8a8f98]" aria-hidden="true">
                    <path d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3l1 1.5h4.5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[12.5px] font-medium text-[#0f1011]">{sub.name}</span>
                  <span className="ml-1 font-mono text-[11px] text-[#8a8f98]">{sub.path}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Files */}
      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Files</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; {files.length}</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
          {files.length === 0 ? (
            <EmptyState title="No files in this folder yet" data-testid="empty-files" />
          ) : (
            <>
              <div className="grid grid-cols-[1fr_120px_80px_140px] border-b border-[#e6e8eb] bg-[#fafbfb] px-4">
                {['Name', 'Type', 'Size', 'Uploaded'].map((h) => (
                  <div key={h} className="h-9 flex items-center text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{h}</div>
                ))}
              </div>
              <div className="divide-y divide-[#eff0f2]" data-testid="file-list">
                {files.map((file) => (
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
