import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getFile, getFolder, openFileStream, resolveDownloadUrl } from '@hq/files';
import { getStorageAdapter } from '@hq/storage';
import { createServiceContext } from '@hq/services';

export const dynamic = 'force-dynamic';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function previewKind(mime: string | null): 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'none' {
  if (!mime) return 'none';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'text/markdown') return 'text';
  return 'none';
}

async function loadTextPreview(fileId: string, ctx: Awaited<ReturnType<typeof createServiceContext>>): Promise<string | null> {
  try {
    const adapter = getStorageAdapter();
    const { stream } = await openFileStream(ctx, fileId, adapter);
    const chunks: Buffer[] = [];
    let bytes = 0;
    const max = 256 * 1024;
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      bytes += buf.byteLength;
      if (bytes >= max) break;
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch {
    return null;
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FileDetailPage({ params }: PageProps) {
  const { id } = await params;
  const principal = await requirePermission(ROUTE_PERMISSIONS.files);
  const ctx = createServiceContext(principal);

  let file;
  try {
    file = await getFile(ctx, id);
  } catch {
    notFound();
  }

  const folder = await getFolder(ctx, file.folderId);
  const adapter = getStorageAdapter();
  const { url: downloadUrl } = await resolveDownloadUrl(ctx, id, adapter);
  const kind = previewKind(file.mime);
  const textPreview = kind === 'text' ? await loadTextPreview(id, ctx) : null;

  const apiDownloadUrl = `/api/files/${id}/download`;
  const previewSrc = downloadUrl ?? apiDownloadUrl;

  return (
    <div data-testid="file-detail" data-file-id={file.id} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <nav aria-label="Breadcrumb" data-testid="breadcrumb" style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          <Link href="/files" style={{ color: '#6b7280', textDecoration: 'none' }}>Files</Link>
          {' / '}
          <Link href={`/files/f/${folder.id}`} style={{ color: '#6b7280', textDecoration: 'none' }}>
            {folder.name}
          </Link>
          {' / '}
          <span>{file.name}</span>
        </nav>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{file.name}</h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
          {file.mime ?? 'unknown type'} · {formatBytes(file.size)} · {file.uploadStatus}
        </p>
      </header>

      <section aria-labelledby="preview-heading">
        <h2 id="preview-heading" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7280', margin: '0 0 12px' }}>
          Preview
        </h2>
        {file.uploadStatus !== 'COMPLETE' ? (
          <p data-testid="preview-pending" style={{ color: '#6b7280', fontSize: 13 }}>
            Upload is still {file.uploadStatus.toLowerCase()}. No preview available yet.
          </p>
        ) : kind === 'image' ? (
          <img
            data-testid="preview-image"
            src={previewSrc}
            alt={file.name}
            style={{ maxWidth: '100%', maxHeight: 600, borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
        ) : kind === 'pdf' ? (
          <iframe
            data-testid="preview-pdf"
            src={previewSrc}
            title={file.name}
            style={{ width: '100%', height: 600, borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
        ) : kind === 'video' ? (
          <video
            data-testid="preview-video"
            src={previewSrc}
            controls
            style={{ maxWidth: '100%', maxHeight: 600, borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
        ) : kind === 'audio' ? (
          <audio data-testid="preview-audio" src={previewSrc} controls style={{ width: '100%' }} />
        ) : kind === 'text' && textPreview !== null ? (
          <pre
            data-testid="preview-text"
            style={{
              padding: 12,
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: '#f9fafb',
              fontSize: 12,
              lineHeight: 1.5,
              maxHeight: 600,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {textPreview}
          </pre>
        ) : (
          <p data-testid="preview-none" style={{ color: '#6b7280', fontSize: 13 }}>
            No inline preview for this file type.{' '}
            <a href={previewSrc} style={{ color: '#2563eb' }}>
              Download to inspect
            </a>
            .
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <a
            data-testid="download-link"
            href={previewSrc}
            style={{ fontSize: 13, color: '#2563eb' }}
          >
            Download original
          </a>
        </div>
      </section>

      <section aria-labelledby="metadata-heading">
        <h2 id="metadata-heading" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7280', margin: '0 0 12px' }}>
          Metadata
        </h2>
        <dl data-testid="metadata-list" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', fontSize: 13, margin: 0 }}>
          <dt style={{ color: '#6b7280' }}>ID</dt>
          <dd style={{ margin: 0, fontFamily: 'ui-monospace, monospace' }}>{file.id}</dd>
          <dt style={{ color: '#6b7280' }}>Folder</dt>
          <dd style={{ margin: 0 }}>
            <Link href={`/files/f/${folder.id}`} style={{ color: '#111827' }}>{folder.path}</Link>
          </dd>
          <dt style={{ color: '#6b7280' }}>Checksum</dt>
          <dd style={{ margin: 0, fontFamily: 'ui-monospace, monospace' }}>{file.checksum ?? '—'}</dd>
          <dt style={{ color: '#6b7280' }}>Index status</dt>
          <dd style={{ margin: 0 }}>{file.indexStatus}</dd>
          <dt style={{ color: '#6b7280' }}>Tags</dt>
          <dd style={{ margin: 0 }}>
            {file.tags.length > 0 ? file.tags.join(', ') : <span style={{ color: '#6b7280' }}>—</span>}
          </dd>
        </dl>
        {file.description && (
          <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5 }} data-testid="file-description">
            {file.description}
          </p>
        )}
      </section>
    </div>
  );
}
