import { Skeleton, SkeletonFeedCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-4" role="status" aria-label="Loading feed">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-48" rounded="rounded-full" />
        <Skeleton className="h-8 w-28" rounded="rounded-full" />
      </div>
      <SkeletonFeedCard />
      <SkeletonFeedCard />
    </div>
  );
}
