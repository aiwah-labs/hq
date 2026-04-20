import { SkeletonStatRow, SkeletonRow, Skeleton } from '@/components/ui';

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 pt-6 pb-10">
      {/* Header */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-72" />
      </div>

      {/* Stat row */}
      <SkeletonStatRow stats={4} className="mb-8" />

      {/* Section header */}
      <Skeleton className="mb-3 h-2.5 w-16" />

      {/* Quick link rows */}
      <div className="rounded-lg border border-[#e6e8eb] bg-white overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} columns={2} />
        ))}
      </div>
    </div>
  );
}
