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
      try { return await objectCount(s.type, {}, ctx); }
      catch { return 0; }
    }),
  );

  return (
    <div className="space-y-4" data-testid="objects-index">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <span>Objects</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Objects</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          Every business object registered in code — operable here.
        </p>
      </div>

      {/* Object type list — single bordered container, not separate cards */}
      <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        <div className="grid grid-cols-[1fr_120px] border-b border-[#e6e8eb] bg-[#fafbfb] px-4">
          <div className="h-9 flex items-center text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Type</div>
          <div className="h-9 flex items-center justify-end text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Records</div>
        </div>
        <div className="divide-y divide-[#eff0f2]">
          {schemas.map((s, i) => (
            <Link
              key={s.type}
              href={`/objects/${s.type}`}
              className="group grid grid-cols-[1fr_120px] items-center px-4 h-11 hover:bg-[#fafbfb] transition-colors duration-100"
              data-testid={`object-card-${s.type}`}
            >
              <div>
                <span className="text-[12.5px] font-medium text-[#0f1011]">{s.pluralLabel}</span>
                <span className="ml-2 text-[11px] font-mono text-[#8a8f98]">{s.type}</span>
              </div>
              <span className="text-right text-[12px] tabular-nums text-[#62666d]">
                {counts[i]} {counts[i] === 1 ? 'record' : 'records'}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
