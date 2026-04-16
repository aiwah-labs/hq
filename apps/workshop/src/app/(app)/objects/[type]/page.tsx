import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getObjectSchema, getListFields, objects, objectList, type ListParams } from '@hq/objects';
import { createServiceContext } from '@hq/services';
import { ObjectTable } from '@/components/objects/object-table';
import { ObjectFilterBar } from '@/components/objects/object-filter-bar';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseListParams(sp: Record<string, string | string[] | undefined>): ListParams {
  const filters: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (k.startsWith('filter.') && typeof v === 'string') {
      filters[k.slice('filter.'.length)] = v;
    }
  }
  return {
    q: typeof sp.q === 'string' ? sp.q : undefined,
    sortBy: typeof sp.sortBy === 'string' ? sp.sortBy : undefined,
    sortDir: sp.sortDir === 'asc' || sp.sortDir === 'desc' ? sp.sortDir : undefined,
    cursor: typeof sp.cursor === 'string' ? sp.cursor : undefined,
    limit: 50,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };
}

export default async function ObjectListPage({ params, searchParams }: Props) {
  const { type } = await params;
  const sp = await searchParams;

  const def = objects[type];
  const schema = getObjectSchema(type);
  if (!def || !schema) notFound();

  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const ctx = createServiceContext(principal);

  const listParams = parseListParams(sp);
  const { items, nextCursor } = await objectList(type, listParams, ctx);

  const listFieldDefs = getListFields(def);
  const listFields = listFieldDefs.map(([name, f]) => schema.fields.find((x) => x.name === name)!).filter(Boolean);
  const filterableFields = schema.fields.filter((f) => f.filterable);

  return (
    <div className="flex h-full flex-col" data-testid={`object-list-${type}`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--fg)]">{schema.pluralLabel}</h1>
          <p className="mt-0.5 text-[13px] text-[var(--muted)]">
            {items.length} {items.length === 1 ? 'record' : 'records'}
            {listParams.q ? ` matching "${listParams.q}"` : ''}
          </p>
        </div>
        <Link
          href={`/objects/${type}/new`}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white"
        >
          New {schema.label}
        </Link>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <ObjectFilterBar schema={schema} filterableFields={filterableFields} />
        <ObjectTable
          schema={schema}
          listFields={listFields}
          rows={items as Array<Record<string, unknown>>}
          emptyHref={`/objects/${type}/new`}
        />
        {nextCursor && (
          <div className="flex justify-center">
            <Link
              href={`/objects/${type}?cursor=${encodeURIComponent(nextCursor)}${listParams.q ? `&q=${encodeURIComponent(listParams.q)}` : ''}`}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[13px]"
            >
              Load more
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
