import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getObjectSchema, getDetailFields, objects, objectGet } from '@hq/objects';
import { createServiceContext } from '@hq/services';
import { ObjectDetail } from '@/components/objects/object-detail';
import { ObjectActionsMenu } from '@/components/objects/object-actions-menu';
import { ActivityTimeline } from '@/components/activity/activity-timeline';
import { deleteObjectAction } from '../actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ type: string; id: string }>;
}

export default async function ObjectDetailPage({ params }: Props) {
  const { type, id } = await params;

  const def = objects[type];
  const schema = getObjectSchema(type);
  if (!def || !schema) notFound();

  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const ctx = createServiceContext(principal);

  let record: Record<string, unknown>;
  try {
    record = (await objectGet(type, id, ctx)) as Record<string, unknown>;
  } catch {
    notFound();
  }

  const detailFieldDefs = getDetailFields(def);
  const detailFields = detailFieldDefs.map(([name]) => schema.fields.find((x) => x.name === name)!).filter(Boolean);

  const displayField = schema.displayField ?? 'id';
  const title = String(record[displayField] ?? id);

  async function onDelete(targetId: string) {
    'use server';
    return deleteObjectAction(type, targetId);
  }

  return (
    <div className="space-y-4" data-testid={`object-detail-page-${type}-${id}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
            <span className="font-medium">Home</span>
            <span className="text-[#d0d6e0]">/</span>
            <Link href={`/objects/${type}`} className="hover:text-[#0f1011] transition-colors">{schema.pluralLabel}</Link>
            <span className="text-[#d0d6e0]">/</span>
            <span>{title}</span>
          </div>
          <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">{title}</h1>
        </div>
        <div className="shrink-0 pt-1">
          <ObjectActionsMenu schema={schema} id={id} deleteAction={onDelete} />
        </div>
      </div>

      <ObjectDetail schema={schema} detailFields={detailFields} record={record} />

      <section data-testid="object-activity">
        <div className="mb-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Activity</h2>
        </div>
        <ActivityTimeline objectType={type} objectId={id} />
      </section>
    </div>
  );
}
