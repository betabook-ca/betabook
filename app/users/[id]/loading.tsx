import { PROFILE_LAYOUT_CLASS } from "@/app/users/[id]/profile-layout";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className={PROFILE_LAYOUT_CLASS}>
      <div className="flex flex-col gap-5 xl:row-span-2">
        <div className="flex items-center gap-4 xl:flex-col xl:items-start xl:gap-3">
          <Skeleton className="size-16 shrink-0" rounded="rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-10 w-56 max-w-full" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-10 w-44" rounded="rounded-full" />
        <Skeleton className="h-24 w-full" rounded="rounded-panel" />
      </div>
      <Skeleton className="h-10 w-full" />
      <SkeletonListRows rows={8} />
    </div>
  );
}
