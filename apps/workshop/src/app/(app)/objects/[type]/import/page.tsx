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
    <div className="flex h-full flex-col" data-testid={`object-import-${type}`}>
      <div className="flex items-center justify-between border-b border-divider px-6 py-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--app-fg)]">
            Import {schema.pluralLabel}
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--app-muted)]">
            Upload a CSV or JSON file, preview validation, then commit.
          </p>
        </div>
        <Link
          href={`/objects/${type}`}
          className="text-[13px] text-[var(--app-muted)] hover:text-[var(--app-fg)]"
        >
          Back to {schema.pluralLabel}
        </Link>
      </div>

      <div className="mx-auto w-full max-w-3xl p-6">
        <div className="mb-5 rounded-md border border-divider bg-[var(--app-bg-elevated)] p-4 text-[13px] text-[var(--app-muted)]">
          <p className="mb-1 font-medium text-[var(--app-fg)]">Supported fields</p>
          <p className="font-mono text-[12px]">
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
