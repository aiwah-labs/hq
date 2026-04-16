import Link from 'next/link';
import type { SerializedField, SerializedObject } from '@hq/objects';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ObjectFieldValue } from './object-field-value';
import { ObjectEmptyState } from './object-empty-state';

interface Props {
  schema: SerializedObject;
  listFields: SerializedField[];
  rows: Array<Record<string, unknown>>;
  emptyHref?: string;
}

function getRowValue(row: Record<string, unknown>, field: SerializedField): unknown {
  if (field.type === 'relation' && field.kind === 'hasMany') {
    const counts = row._count as Record<string, number> | undefined;
    return counts?.[field.name];
  }
  return row[field.name];
}

export function ObjectTable({ schema, listFields, rows, emptyHref }: Props) {
  if (rows.length === 0) {
    return <ObjectEmptyState schema={schema} href={emptyHref} />;
  }

  return (
    <TableWrap data-testid={`object-table-${schema.type}`}>
      <Table>
        <THead>
          <TR>
            {listFields.map((f) => (
              <TH key={f.name} style={f.list?.width ? { width: f.list.width } : undefined}>
                {f.label}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => {
            const id = row.id as string;
            return (
              <TR key={id} data-testid={`object-row-${id}`}>
                {listFields.map((f, idx) => (
                  <TD key={f.name}>
                    {idx === 0 ? (
                      <Link
                        href={`/objects/${schema.type}/${id}`}
                        className="text-[var(--fg)] hover:text-[var(--accent)] hover:underline"
                      >
                        <ObjectFieldValue field={f} value={getRowValue(row, f)} />
                      </Link>
                    ) : (
                      <ObjectFieldValue field={f} value={getRowValue(row, f)} />
                    )}
                  </TD>
                ))}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableWrap>
  );
}
