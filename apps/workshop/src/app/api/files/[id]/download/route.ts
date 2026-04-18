import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getFile, openFileStream, resolveDownloadUrl } from '@hq/files';
import { getStorageAdapter } from '@hq/storage';
import { createServiceContext } from '@hq/services';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const principal = await requirePermission(ROUTE_PERMISSIONS.files);
  const ctx = createServiceContext(principal);
  const adapter = getStorageAdapter();

  try {
    const { file, url } = await resolveDownloadUrl(ctx, id, adapter);
    if (url) {
      return NextResponse.redirect(url, 302);
    }

    const { stream } = await openFileStream(ctx, id, adapter);
    const headers = new Headers({
      'content-type': file.mime ?? 'application/octet-stream',
      'content-disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
    });
    if (file.size) headers.set('content-length', String(file.size));

    return new Response(stream as unknown as ReadableStream, { headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'File not found.') {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }
    throw err;
  }
}
