import { ClimbActivityLoading, ClimbStatsLoading } from "@/components/climb-page-loading";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the climb page: breadcrumbs, eyebrow + display name, the grade
 * box + discipline chip row, description, then the stat cards (summary,
 * breakdown, logged grades) beside the sends list. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-56 max-w-full" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <div className="mt-1 flex items-center gap-2">
          <Skeleton className="h-5 w-10" />
          <Skeleton className="h-5 w-16" rounded="rounded-full" />
        </div>
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
          <ClimbStatsLoading />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <ClimbActivityLoading />
        </div>
      </div>
    </div>
  );
}
