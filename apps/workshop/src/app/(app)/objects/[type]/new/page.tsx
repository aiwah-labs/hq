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
    <div className="space-y-4" data-testid={`object-new-${type}`}>
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <Link href={`/objects/${type}`} className="hover:text-[#0f1011] transition-colors">{schema.pluralLabel}</Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>New</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">
          New {schema.label}
        </h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          Create a new {schema.label.toLowerCase()} record.
        </p>
      </div>

      <div className="max-w-xl">
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
