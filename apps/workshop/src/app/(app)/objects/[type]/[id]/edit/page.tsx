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
    <div className="flex h-full flex-col" data-testid={`object-edit-${type}-${id}`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <Link
            href={`/objects/${type}/${id}`}
            className="text-[12px] text-[var(--muted)] hover:text-[var(--fg)]"
          >
            ← Back
          </Link>
          <h1 className="mt-0.5 text-[18px] font-semibold text-[var(--fg)]">
            Edit {schema.label}
          </h1>
        </div>
      </div>

      <div className="max-w-xl p-6">
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
