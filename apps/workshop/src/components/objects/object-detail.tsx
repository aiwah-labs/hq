import type { SerializedField, SerializedObject } from '@hq/objects';
import { ObjectFieldValue } from './object-field-value';

interface Props {
  schema: SerializedObject;
  detailFields: SerializedField[];
  record: Record<string, unknown>;
}

function groupFields(fields: SerializedField[]): Record<string, SerializedField[]> {
  const groups: Record<string, SerializedField[]> = {};
  for (const f of fields) {
    const g = f.detail?.section ?? f.group ?? 'General';
    (groups[g] ??= []).push(f);
  }
  return groups;
}

function valueOf(record: Record<string, unknown>, field: SerializedField): unknown {
  if (field.type === 'relation' && field.kind === 'hasMany') {
    const counts = record._count as Record<string, number> | undefined;
    return counts?.[field.name];
  }
  return record[field.name];
}

export function ObjectDetail({ schema, detailFields, record }: Props) {
  const grouped = groupFields(detailFields);
  return (
    <div className="flex flex-col gap-6" data-testid={`object-detail-${schema.type}`}>
      {Object.entries(grouped).map(([section, fields]) => (
        <section key={section} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {section}
          </h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  {f.label}
                </dt>
                <dd className="mt-0.5 text-[13px] text-[var(--fg)]">
                  <ObjectFieldValue field={f} value={valueOf(record, f)} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
