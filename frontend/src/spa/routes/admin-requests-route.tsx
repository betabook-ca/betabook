import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";

import { ReviewQueue, type ReviewQueueData } from "@/components/admin/review-queue";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { fetchApi } from "@/spa/lib/api";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type QueueState =
  | { key: string; data: ReviewQueueData }
  | { key: string; forbidden: true }
  | { key: string; error: true };

export default function AdminRequestsRoute({ viewerId }: { viewerId: string | null }) {
  const [params] = useSearchParams();
  const revision = useRouterRefreshKey();
  const query = params.toString();
  const key = JSON.stringify([viewerId, query, revision]);
  const [state, setState] = useState<QueueState | null>(null);
  useEffect(() => {
    if (!viewerId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const data = await fetchApi("/api/pages/admin/requests", {
          query: new URLSearchParams(query),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setState({ key, data });
      } catch (error) {
        if (!controller.signal.aborted) {
          if (error instanceof Error && "status" in error && error.status === 403)
            setState({ key, forbidden: true });
          else setState({ key, error: true });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [viewerId, key, query]);
  if (!viewerId) return <CurrentPageAuthCallout />;
  if (state?.key !== key) return <SkeletonListRows rows={4} />;
  if ("forbidden" in state) return <Navigate to="/" replace />;
  if ("error" in state) return <p role="alert">Could not load review requests.</p>;
  return <ReviewQueue {...state.data} />;
}
