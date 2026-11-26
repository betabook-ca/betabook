import { Skeleton, SkeletonListRows, SkeletonStatCard } from "@/components/ui/skeleton";

/** The climb page sidebar: the summary and ascent breakdown cards. */
export function ClimbStatsLoading() {
  return (
    <>
      <SkeletonStatCard stats={3} />
      <SkeletonStatCard stats={2} />
    </>
  );
}

/** The climb page main column: a section heading and the sends list. */
export function ClimbActivityLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-20" />
      <SkeletonListRows rows={5} />
    </div>
  );
}
