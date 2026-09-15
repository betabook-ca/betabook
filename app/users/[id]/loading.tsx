import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-11 w-full" />
      <SkeletonListRows rows={8} />
    </div>
  );
}
