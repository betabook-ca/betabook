import { ProfileLayout } from "@/components/profile-layout";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ProfileLayout
      heading={
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 shrink-0" rounded="rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-9 w-48 max-w-full" />
            <Skeleton className="h-6 w-40 max-w-full" rounded="rounded-full" />
          </div>
        </div>
      }
      tabs={<Skeleton className="h-10 w-full" />}
    >
      <SkeletonListRows rows={8} />
    </ProfileLayout>
  );
}
