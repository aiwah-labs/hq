import Link from 'next/link';
import type { SerializedObject } from '@hq/objects';

interface Props {
  schema: SerializedObject;
  href?: string;
}

export function ObjectEmptyState({ schema, href }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-6 py-12 text-center"
      data-testid={`object-empty-${schema.type}`}
    >
      <p className="text-[14px] font-medium text-[var(--fg)]">
        No {schema.pluralLabel.toLowerCase()} yet
      </p>
      <p className="mt-1 text-[13px] text-[var(--muted)]">
        Add your first {schema.label.toLowerCase()} to start populating this view.
      </p>
      {href && (
        <Link
          href={href}
          className="mt-4 inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--fg)] hover:border-[var(--accent)]"
        >
          Create {schema.label}
        </Link>
      )}
    </div>
  );
}
