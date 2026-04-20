import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getObjectSchema, getFormFields, objects, objectGet } from '@hq/objects';
import { createServiceContext } from '@hq/services';
import { ObjectForm } from '@/components/objects/object-form';
import { updateObjectAction } from '../../actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ type: string; id: string }>;
}

export default async function ObjectEditPage({ params }: Props) {
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

  const formFieldDefs = getFormFields(def);
  const formFields = formFieldDefs.map(([name]) => schema.fields.find((x) => x.name === name)!).filter(Boolean);

  async function action(formData: FormData) {
    'use server';
    return updateObjectAction(type, id, formData);
  }

  return (
    <div className="space-y-4" data-testid={`object-edit-${type}-${id}`}>
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <Link href={`/objects/${type}`} className="hover:text-[#0f1011] transition-colors">{schema.pluralLabel}</Link>
          <span className="text-[#d0d6e0]">/</span>
          <Link href={`/objects/${type}/${id}`} className="hover:text-[#0f1011] transition-colors">{id.slice(0, 8)}…</Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>Edit</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">
          Edit {schema.label}
        </h1>
      </div>

      <div className="max-w-xl">
        <ObjectForm
          schema={schema}
          formFields={formFields}
          initialValues={record}
          action={action}
          submitLabel="Save changes"
          cancelHref={`/objects/${type}/${id}`}
        />
      </div>
    </div>
  );
}
