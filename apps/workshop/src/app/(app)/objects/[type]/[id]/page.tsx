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
    <div className="flex h-full flex-col" data-testid={`object-detail-page-${type}-${id}`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <Link
            href={`/objects/${type}`}
            className="text-[12px] text-[var(--muted)] hover:text-[var(--fg)]"
          >
            ← {schema.pluralLabel}
          </Link>
          <h1 className="mt-0.5 text-[18px] font-semibold text-[var(--fg)]">{title}</h1>
        </div>
        <ObjectActionsMenu schema={schema} id={id} deleteAction={onDelete} />
      </div>

      <div className="space-y-6 p-6">
        <ObjectDetail schema={schema} detailFields={detailFields} record={record} />
        <section data-testid="object-activity">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Activity
          </h2>
          <ActivityTimeline objectType={type} objectId={id} />
        </section>
      </div>
    </div>
  );
}
