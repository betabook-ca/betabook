import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";

/** Mirrors the area page: crag header, then the climb toolbar and table
 * beside the lg:w-64 sub-area rail. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-56 max-w-full" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-16" rounded="rounded-full" />
        </div>
        {/* The histogram collapses to a trigger row below md. */}
        <Skeleton className="mt-2 h-6 w-28 md:hidden" />
        <div className="mt-2 hidden items-end gap-6 md:flex">
          <Skeleton className="h-20 w-64 max-w-[45%]" />
          <Skeleton className="h-20 w-64 max-w-[45%]" />
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="order-2 flex min-w-0 flex-1 flex-col gap-3 lg:order-1">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-9 w-full" rounded="rounded-lg" />
          <SkeletonListRows rows={8} />
        </div>
        <div className="order-1 lg:order-2 lg:w-64 lg:shrink-0">
          <Skeleton className="h-8 w-full lg:h-64" rounded="rounded-panel" />
        </div>
      </div>
    </div>
  );
}
