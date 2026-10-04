import { Skeleton, SkeletonStatCard } from "@/components/ui/skeleton";

/** Stands in for AnalyticsDashboard while its reads stream: the period picker,
 * a row of stat tiles, then a chart. */
export function AnalyticsLoading() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonStatCard key={i} stats={1} />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
