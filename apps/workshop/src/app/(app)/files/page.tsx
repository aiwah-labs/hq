import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { listFolders, searchFiles } from '@hq/files';
import { createServiceContext } from '@hq/services';

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

export default async function FilesPage() {
  const principal = await requirePermission(ROUTE_PERMISSIONS.files);
  const ctx = createServiceContext(principal);

  const rootFolders = await listFolders(ctx, { parentId: null });
  const recentRaw = await searchFiles(ctx, { limit: 12 });
  const recent = recentRaw.items as FileRow[];

  return (
    <div data-testid="files-page" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Files</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
            Folders all the way down. Upload anywhere, search everywhere.
          </p>
        </div>
      </header>

      <section aria-labelledby="folders-heading">
        <h2 id="folders-heading" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7280', margin: '0 0 12px' }}>
          Top-level folders
        </h2>
        {rootFolders.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 13 }} data-testid="no-folders">
            No folders yet. Create one by seeding system folders or via the API.
          </p>
        ) : (
          <ul
            data-testid="folder-list"
            style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {rootFolders.map((folder) => (
              <li key={folder.id}>
                <Link
                  href={`/files/f/${folder.id}`}
                  data-testid={`folder-card-${folder.id}`}
                  style={{
                    display: 'block',
                    padding: 12,
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    textDecoration: 'none',
                    color: '#111827',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                    <span aria-hidden="true">📁</span>
                    <span>{folder.name}</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                    {folder.path} · {folder.kind}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7280', margin: '0 0 12px' }}>
          Recent files
        </h2>
        {recent.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 13 }} data-testid="no-files">
            No files uploaded yet.
          </p>
        ) : (
          <table
            data-testid="recent-files-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Mime</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Size</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((file) => (
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
