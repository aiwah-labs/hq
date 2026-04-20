'use client';

import { cn } from '@/lib/cn';

// TopProgress — ui-design skill rules:
// - 2px bar at the top of a panel/page boundary for background refetches.
// - Only use when panel already has data (stale-while-revalidate pattern).
// - Never use as the primary loading indicator on first load — use Skeleton instead.
// - Indeterminate (sliding animation). Use DeterminateProgress for known %s.

export function TopProgress({ className }: { className?: string }) {
  return (
    <div
      className={cn('absolute inset-x-0 top-0 h-[2px] overflow-hidden', className)}
      aria-hidden="true"
    >
      <div className="h-full w-1/3 bg-[#009E85] animate-[topProgress_1.4s_ease-in-out_infinite]" />
    </div>
  );
}

// DeterminateProgress — for long jobs with known progress (uploads, batch runs, renders)
// Only show for operations that take >2s. Never use for sub-2s feedback.
export function DeterminateProgress({
  value,
  label,
  className,
}: {
  value: number; // 0–100
  label?: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] text-[#62666d]">{label}</p>
          <p className="text-[11px] font-medium tabular-nums text-[#0f1011]">{clamped}%</p>
        </div>
      )}
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#f3f4f5]">
        <div
          className="h-full rounded-full bg-[#009E85] transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>
    </div>
  );
}

// DotPulse — for streaming AI output or "thinking" states only.
// Not for generic loading — too playful for data-dense tool pages.
export function DotPulse({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-[3px]', className)}
      aria-label="Loading…"
      aria-busy="true"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-[#8a8f98] animate-pulse"
          style={{ animationDelay: `${i * 0.15}s` }}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
