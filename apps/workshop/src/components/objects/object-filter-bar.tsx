'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { SerializedField, SerializedObject } from '@hq/objects';

interface Props {
  schema: SerializedObject;
  filterableFields: SerializedField[];
}

export function ObjectFilterBar({ schema, filterableFields }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/objects/${schema.type}?${next.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      role="search"
      aria-label={`Filter ${schema.pluralLabel}`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const q = String(fd.get('q') ?? '');
        updateParam('q', q);
      }}
    >
      <input
        type="search"
        name="q"
        defaultValue={params.get('q') ?? ''}
        placeholder={`Search ${schema.pluralLabel.toLowerCase()}`}
        className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-3 py-1.5 text-[13px]"
      />
      {filterableFields
        .filter((f) => f.type === 'enum' && f.values)
        .map((f) => (
          <select
            key={f.name}
            defaultValue={params.get(`filter.${f.name}`) ?? ''}
            onChange={(e) => updateParam(`filter.${f.name}`, e.target.value)}
            className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-2 py-1.5 text-[13px]"
            aria-label={`Filter by ${f.label}`}
          >
            <option value="">{f.label}: any</option>
            {f.values!.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ))}
      <button
        type="submit"
        className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-3 py-1.5 text-[13px] font-medium"
      >
        Search
      </button>
    </form>
  );
}
