import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getObjectSchema, getFormFields, objects } from '@hq/objects';
import { ObjectForm } from '@/components/objects/object-form';
import { createObjectAction } from '../actions';

interface Props {
  params: Promise<{ type: string }>;
}

export default async function ObjectNewPage({ params }: Props) {
  const { type } = await params;

  const def = objects[type];
  const schema = getObjectSchema(type);
  if (!def || !schema) notFound();

  await requirePermission(ROUTE_PERMISSIONS.workshop);

  const formFieldDefs = getFormFields(def);
  const formFields = formFieldDefs.map(([name]) => schema.fields.find((x) => x.name === name)!).filter(Boolean);

  async function action(formData: FormData) {
    'use server';
    return createObjectAction(type, formData);
  }

  return (
    <div className="flex h-full flex-col" data-testid={`object-new-${type}`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--fg)]">
            New {schema.label}
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--muted)]">
            Create a new {schema.label.toLowerCase()} record.
          </p>
        </div>
        <Link
          href={`/objects/${type}`}
          className="text-[13px] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          ← Back to {schema.pluralLabel}
        </Link>
      </div>

      <div className="max-w-xl p-6">
        <ObjectForm
          schema={schema}
          formFields={formFields}
          action={action}
          cancelHref={`/objects/${type}`}
        />
      </div>
    </div>
  );
}
