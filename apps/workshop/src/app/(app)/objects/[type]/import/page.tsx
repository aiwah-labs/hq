import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';
import { getObjectSchema, objects } from '@hq/objects';
import { ImportForm } from './ImportForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ type: string }>;
}

export default async function ImportObjectPage({ params }: Props) {
  const { type } = await params;
  const def = objects[type];
  const schema = getObjectSchema(type);
  if (!def || !schema) notFound();

  await requirePermission(PERMISSIONS.workshopView);

  return (
    <div className="space-y-4" data-testid={`object-import-${type}`}>
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <Link href={`/objects/${type}`} className="hover:text-[#0f1011] transition-colors">{schema.pluralLabel}</Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>Import</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">
          Import {schema.pluralLabel}
        </h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          Upload a CSV or JSON file, preview validation, then commit.
        </p>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="rounded-lg border border-[#e6e8eb] bg-white p-4 text-[13px] text-[#62666d]">
          <p className="mb-1 text-[12.5px] font-medium text-[#0f1011]">Supported fields</p>
          <p className="font-mono text-[11px]">
            {schema.fields
              .filter((f) => !f.readonly && f.type !== 'relation')
              .map((f) => f.name)
              .join(', ')}
          </p>
        </div>
        <ImportForm type={type} label={schema.label} />
      </div>
    </div>
  );
}
