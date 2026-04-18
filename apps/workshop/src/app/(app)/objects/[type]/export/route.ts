import { NextRequest, NextResponse } from 'next/server';
import { exportObject, objects } from '@hq/objects';
import { createServiceContext } from '@hq/services';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  if (!objects[type]) {
    return NextResponse.json({ error: `Unknown object type: ${type}` }, { status: 404 });
  }

  const principal = await requirePermission(PERMISSIONS.workshopView);
  const ctx = createServiceContext(principal);

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') ?? 'csv') as 'csv' | 'json';
  const q = url.searchParams.get('q') ?? undefined;
  const fieldsParam = url.searchParams.get('fields');
  const fields = fieldsParam ? fieldsParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  const result = await exportObject(type, { format, q, fields }, ctx);

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
