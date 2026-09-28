import { Skeleton, SkeletonFeedCard } from "@/components/ui/skeleton";
import { CommunityLoading } from "@/components/workspace-loading";

/** Under the real Community tabs: the activity pills and refresh control,
 * then feed cards. */
export default function Loading() {
  return (
    <CommunityLoading label="Loading feed">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-48" rounded="rounded-full" />
        <Skeleton className="h-8 w-28" rounded="rounded-full" />
      </div>
      <SkeletonFeedCard />
      <SkeletonFeedCard />
    </CommunityLoading>
  );
}
