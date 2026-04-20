import { cn } from '@/lib/cn';

// Skeleton — ui-design skill rules:
// 1. Match real layout exactly — same heights, same column widths.
// 2. Shape, not shimmer. bg-[#f3f4f5] blocks, slow pulse (1.6s via Tailwind animate-pulse).
// 3. Text blocks at 60% width, varied across rows so it doesn't read as a barcode.
// 4. Never full-width bars for text.
// 5. Show after 150ms (gate in the parent with useDeferredValue or a timeout).

interface SkeletonProps {
  className?: string;
}

// Generic rectangular block
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('rounded-md bg-[#f3f4f5] animate-pulse', className)}
      aria-hidden="true"
    />
  );
}

// Skeleton for a standard 36px table row — grid layout must be passed via className
// e.g. className="grid-cols-[1fr_120px_80px_80px]"
export function SkeletonRow({
  columns = 4,
  className,
}: {
  columns?: number;
  className?: string;
}) {
  // Vary widths so rows don't look like barcodes
  const widths = ['55%', '70%', '45%', '60%', '50%', '65%', '40%', '75%'];

  return (
    <div
      className={cn(
        'flex h-9 items-center gap-4 border-b border-[#eff0f2] px-4',
        className,
      )}
      aria-hidden="true"
    >
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="flex-1">
          <div
            className="h-3 rounded-md bg-[#f3f4f5] animate-pulse"
            style={{ width: widths[i % widths.length] }}
          />
        </div>
      ))}
    </div>
  );
}

// Skeleton for a text line — inline, for use inside paragraphs or headings
export function SkeletonText({
  width = '60%',
  height = '12px',
  className,
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-block rounded-md bg-[#f3f4f5] animate-pulse align-middle', className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

// Skeleton for a full table — renders a header chrome + N skeleton rows
export function SkeletonTable({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-lg border border-[#e6e8eb] bg-white overflow-hidden', className)}
      aria-label="Loading…"
      aria-busy="true"
    >
      {/* Header */}
      <div className="flex h-9 items-center gap-4 border-b border-[#e6e8eb] bg-[#fafbfb] px-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex-1">
            <div className="h-2.5 w-14 rounded bg-[#e6e8eb] animate-pulse" />
          </div>
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </div>
  );
}

// Skeleton for a stat row (single bordered row with hairline dividers)
export function SkeletonStatRow({
  stats = 4,
  className,
}: {
  stats?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-stretch border border-[#e6e8eb] rounded-lg bg-white overflow-hidden',
        className,
      )}
      aria-hidden="true"
    >
      {Array.from({ length: stats }).map((_, i) => (
        <div
          key={i}
          className={cn('flex-1 px-4 py-3 space-y-1.5', i > 0 && 'border-l border-[#e6e8eb]')}
        >
          <div className="h-2 w-14 rounded bg-[#f3f4f5] animate-pulse" />
          <div className="h-5 w-10 rounded bg-[#f3f4f5] animate-pulse" />
          <div className="h-2 w-16 rounded bg-[#f3f4f5] animate-pulse" />
        </div>
      ))}
    </div>
  );
}
