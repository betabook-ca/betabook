import { Navigate, useSearchParams } from "react-router";

import { ReviewQueue } from "@/components/admin/review-queue";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { fetchApi } from "@/spa/lib/api";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

export default function AdminRequestsRoute({ viewerId }: { viewerId: string | null }) {
  const [params] = useSearchParams();
  const cursor = new URLSearchParams();
  for (const key of ["at", "after"]) {
    const value = params.get(key);
    if (value !== null) cursor.set(key, value);
  }
  const { data, error, pending } = useRetainedPage({
    scope: viewerId,
    query: cursor.toString(),
    load: (signal) => fetchApi("/api/pages/admin/requests", { query: cursor, signal }),
  });
  if (!viewerId) return <CurrentPageAuthCallout />;
  if (error instanceof Error && "status" in error && error.status === 403)
    return <Navigate to="/" replace />;
  if (!data)
    return error ? (
      <p role="alert">Could not load review requests.</p>
    ) : (
      <SkeletonListRows rows={4} />
    );
  return (
    <>
      <ReviewQueue {...data} pending={pending} />
      {error && <p role="alert">Could not load review requests.</p>}
    </>
  );
}
