import type { SerializedField } from '@hq/objects';

interface Props {
  field: SerializedField;
  value: unknown;
}

function formatDate(v: unknown): string {
  if (!v) return '—';
  const d = typeof v === 'string' || v instanceof Date ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(v: unknown): string {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatPercent(v: unknown): string {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(0)}%`;
}

export function ObjectFieldValue({ field, value }: Props) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-[#62666d]">—</span>;
  }

  if (field.type === 'boolean') {
    return <span>{value ? 'Yes' : 'No'}</span>;
  }

  if (field.type === 'date' || field.format === 'date' || field.format === 'datetime') {
    return <span>{formatDate(value)}</span>;
  }

  if (field.format === 'currency') {
    return <span>{formatCurrency(value)}</span>;
  }

  if (field.format === 'percent') {
    return <span>{formatPercent(value)}</span>;
  }

  if (field.format === 'email' && typeof value === 'string') {
    return (
      <a href={`mailto:${value}`} className="text-[#009E85] hover:underline">
        {value}
      </a>
    );
  }

  if (field.format === 'url' && typeof value === 'string') {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="text-[#009E85] hover:underline">
        {value}
      </a>
    );
  }

  if (field.type === 'enum') {
    return (
      <span className="inline-flex items-center rounded-md border border-[#e6e8eb] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] font-medium">
        {String(value)}
      </span>
    );
  }

  if (field.type === 'json') {
    return (
      <code className="text-[11px] text-[#62666d]">
        {typeof value === 'string' ? value : JSON.stringify(value)}
      </code>
    );
  }

  if (field.type === 'relation' && field.kind === 'hasMany' && typeof value === 'number') {
    return <span>{value}</span>;
  }

  return <span>{String(value)}</span>;
}
