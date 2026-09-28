import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { CommunityLoading } from "@/components/workspace-loading";

/** Under the real Community tabs: the Friends/Requests pills, then rows. */
export default function Loading() {
  return (
    <CommunityLoading label="Loading friends">
      <Skeleton className="h-9 w-48" />
      <SkeletonListRows rows={6} />
    </CommunityLoading>
  );
}
