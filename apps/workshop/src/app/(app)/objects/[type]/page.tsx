import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getObjectSchema, getListFields, objects, objectList, type ListParams } from '@hq/objects';
import { createServiceContext } from '@hq/services';
import { Button } from '@/components/ui';
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
    <div className="space-y-4" data-testid={`object-list-${type}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
            <span className="font-medium">Home</span>
            <span className="text-[#d0d6e0]">/</span>
            <span>{schema.pluralLabel}</span>
          </div>
          <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">{schema.pluralLabel}</h1>
          <p className="mt-2 text-[12.5px] text-[#62666d]">
            {items.length} {items.length === 1 ? 'record' : 'records'}
            {listParams.q ? ` matching "${listParams.q}"` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <a
            href={`/objects/${type}/export?format=csv${listParams.q ? `&q=${encodeURIComponent(listParams.q)}` : ''}`}
            data-testid={`object-export-${type}`}
          >
            <Button variant="outline" size="sm">Export CSV</Button>
          </a>
          <Link href={`/objects/${type}/import`} data-testid={`object-import-link-${type}`}>
            <Button variant="outline" size="sm">Import</Button>
          </Link>
          <Link href={`/objects/${type}/new`}>
            <Button variant="primary" size="sm">New {schema.label}</Button>
          </Link>
        </div>
      </div>

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
            className="rounded-md border border-[#e6e8eb] bg-white px-3 py-1.5 text-[13px] text-[#62666d] hover:bg-[#fafbfb] transition-colors"
          >
            Load more
          </Link>
        </div>
      )}
    </div>
  );
}
