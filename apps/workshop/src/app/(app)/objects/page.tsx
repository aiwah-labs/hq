import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { listObjectSchemas, objectCount } from '@hq/objects';
import { createServiceContext } from '@hq/services';

export const dynamic = 'force-dynamic';

export default async function ObjectIndexPage() {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const ctx = createServiceContext(principal);
  const schemas = listObjectSchemas();

  const counts = await Promise.all(
    schemas.map(async (s) => {
      try {
        return await objectCount(s.type, {}, ctx);
      } catch {
        return 0;
      }
    }),
  );

  return (
    <div className="flex h-full flex-col" data-testid="objects-index">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--fg)]">Objects</h1>
          <p className="mt-0.5 text-[13px] text-[var(--muted)]">
            Every business object registered in code is operable here.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {schemas.map((s, i) => (
          <Link
            key={s.type}
            href={`/objects/${s.type}`}
            className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 hover:border-[var(--accent)]"
            data-testid={`object-card-${s.type}`}
          >
            <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">
              {s.type}
            </span>
            <span className="mt-0.5 text-[16px] font-semibold text-[var(--fg)]">
              {s.pluralLabel}
            </span>
            <span className="mt-1 text-[13px] text-[var(--muted)]">
              {counts[i]} {counts[i] === 1 ? 'record' : 'records'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
