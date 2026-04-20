import { Skeleton, SkeletonTable } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-5 w-40" />
      </div>
      <SkeletonTable rows={8} columns={5} />
    </div>
  );
}
