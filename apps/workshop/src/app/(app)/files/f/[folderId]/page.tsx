import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getFolder, listFolders, searchFiles } from '@hq/files';
import { createServiceContext } from '@hq/services';
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
    <div data-testid="folder-page" data-folder-id={folder.id} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <nav aria-label="Breadcrumb" data-testid="breadcrumb" style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          <Link href="/files" style={{ color: '#6b7280', textDecoration: 'none' }}>Files</Link>
          {segments.map((seg, i) => (
            <span key={i}>
              {' / '}
              <span>{seg}</span>
            </span>
          ))}
        </nav>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
          <span aria-hidden="true">📁 </span>
          {folder.name}
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
          {folder.path} · {folder.kind} · {subfolders.length} folder(s), {files.length} file(s)
        </p>
      </header>

      <section aria-labelledby="upload-heading">
        <h2 id="upload-heading" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7280', margin: '0 0 12px' }}>
          Upload
        </h2>
        <UploadForm folderId={folder.id} />
      </section>

      {subfolders.length > 0 && (
        <section aria-labelledby="subfolders-heading">
          <h2 id="subfolders-heading" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7280', margin: '0 0 12px' }}>
            Subfolders
          </h2>
          <ul
            data-testid="subfolder-list"
            style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
          >
            {subfolders.map((sub) => (
              <li key={sub.id}>
                <Link
                  href={`/files/f/${sub.id}`}
                  data-testid={`folder-card-${sub.id}`}
                  style={{
                    display: 'block',
                    padding: 10,
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    textDecoration: 'none',
                    color: '#111827',
                    fontSize: 14,
                  }}
                >
                  <span aria-hidden="true">📁 </span>
                  {sub.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="files-heading">
        <h2 id="files-heading" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7280', margin: '0 0 12px' }}>
          Files
        </h2>
        {files.length === 0 ? (
          <p data-testid="empty-files" style={{ color: '#6b7280', fontSize: 13 }}>
            No files in this folder yet.
          </p>
        ) : (
          <table data-testid="file-list" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Mime</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Size</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px' }}>
                    <Link
                      href={`/files/file/${file.id}`}
                      data-testid={`file-row-${file.id}`}
                      style={{ color: '#111827', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {file.name}
                    </Link>
                  </td>
                  <td style={{ padding: '8px', color: '#6b7280' }}>{file.mime ?? '—'}</td>
                  <td style={{ padding: '8px', color: '#6b7280' }}>{formatBytes(file.size)}</td>
                  <td style={{ padding: '8px', color: '#6b7280' }}>
                    {file.uploadedAt ? new Date(file.uploadedAt).toLocaleString() : 'Pending'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
