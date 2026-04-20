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
    <div className="space-y-4" data-testid="file-detail" data-file-id={file.id}>
      {/* Header */}
      <div>
        <nav aria-label="Breadcrumb" data-testid="breadcrumb" className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <Link href="/files" className="font-medium hover:text-[#0f1011] transition-colors">Files</Link>
          <span className="text-[#d0d6e0]">/</span>
          <Link href={`/files/f/${folder.id}`} className="hover:text-[#0f1011] transition-colors">{folder.name}</Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>{file.name}</span>
        </nav>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">{file.name}</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          {file.mime ?? 'unknown type'} · {formatBytes(file.size)} · {file.uploadStatus}
        </p>
      </div>

      {/* Preview */}
      <div>
        <div className="mb-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Preview</h2>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white p-4" data-testid="preview-section">
          {file.uploadStatus !== 'COMPLETE' ? (
            <p data-testid="preview-pending" className="text-[13px] text-[#62666d]">
              Upload is still {file.uploadStatus.toLowerCase()}. No preview available yet.
            </p>
          ) : kind === 'image' ? (
            <img
              data-testid="preview-image"
              src={previewSrc}
              alt={file.name}
              className="max-h-[600px] max-w-full rounded-md border border-[#e6e8eb]"
            />
          ) : kind === 'pdf' ? (
            <iframe
              data-testid="preview-pdf"
              src={previewSrc}
              title={file.name}
              className="h-[600px] w-full rounded-md border border-[#e6e8eb]"
            />
          ) : kind === 'video' ? (
            <video
              data-testid="preview-video"
              src={previewSrc}
              controls
              className="max-h-[600px] max-w-full rounded-md border border-[#e6e8eb]"
            />
          ) : kind === 'audio' ? (
            <audio data-testid="preview-audio" src={previewSrc} controls className="w-full" />
          ) : kind === 'text' && textPreview !== null ? (
            <pre
              data-testid="preview-text"
              className="max-h-[600px] overflow-auto rounded-md border border-[#e6e8eb] bg-[#fafbfb] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words"
            >
              {textPreview}
            </pre>
          ) : (
            <p data-testid="preview-none" className="text-[13px] text-[#62666d]">
              No inline preview for this file type.{' '}
              <a href={previewSrc} className="text-[#009E85] hover:underline">Download to inspect</a>.
            </p>
          )}
          <div className="mt-3">
            <a data-testid="download-link" href={previewSrc} className="text-[13px] text-[#009E85] hover:underline">
              Download original
            </a>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div>
        <div className="mb-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Metadata</h2>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white p-4">
          <dl data-testid="metadata-list" className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
            <dt className="text-[11px] font-medium text-[#8a8f98]">ID</dt>
            <dd className="font-mono text-[11px] text-[#0f1011]">{file.id}</dd>
            <dt className="text-[11px] font-medium text-[#8a8f98]">Folder</dt>
            <dd className="text-[12.5px]">
              <Link href={`/files/f/${folder.id}`} className="text-[#009E85] hover:underline">{folder.path}</Link>
            </dd>
            <dt className="text-[11px] font-medium text-[#8a8f98]">Checksum</dt>
            <dd className="font-mono text-[11px] text-[#0f1011]">{file.checksum ?? '—'}</dd>
            <dt className="text-[11px] font-medium text-[#8a8f98]">Index status</dt>
            <dd className="text-[12.5px] text-[#0f1011]">{file.indexStatus}</dd>
            <dt className="text-[11px] font-medium text-[#8a8f98]">Tags</dt>
            <dd className="text-[12.5px] text-[#0f1011]">
              {file.tags.length > 0 ? file.tags.join(', ') : <span className="text-[#8a8f98]">—</span>}
            </dd>
          </dl>
          {file.description && (
            <p className="mt-3 text-[13px] leading-relaxed text-[#62666d]" data-testid="file-description">
              {file.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
