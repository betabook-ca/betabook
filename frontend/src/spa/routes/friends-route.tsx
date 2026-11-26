import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { AuthCallout } from "@/components/auth-callout";
import { FriendsContent } from "@/components/friends-content";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { WorkspaceShell } from "@/components/workspace-shell";
import { parseFriendsView } from "@/lib/friendships";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type FriendsPayload = ApiResponse<"/api/pages/friends"> & { viewerId: string };

export default function FriendsRoute({ viewerId }: { viewerId: string | null }) {
  const [searchParams] = useSearchParams();
  const refreshKey = useRouterRefreshKey();
  const view = parseFriendsView(searchParams.get("view") ?? undefined);

  const [data, setData] = useState<FriendsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matches =
    data !== null && viewerId !== null && data.viewerId === viewerId && data.view === view;

  useEffect(() => {
    if (!viewerId) {
      return;
    }
    const targetViewer = viewerId;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchApi("/api/pages/friends", { query: { view } });
        if (!cancelled) {
          setError(null);
          setData({ viewerId: targetViewer, ...res });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load friends");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [viewerId, view, refreshKey]);

  if (!viewerId) {
    return <AuthCallout next={view === "friends" ? "/friends" : `/friends?view=${view}`} />;
  }
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-surface p-6 text-danger">
        {error}
      </div>
    );
  }
  if (!matches || !data) {
    return <SkeletonListRows rows={8} />;
  }

  return (
    <WorkspaceShell area="community" userId={viewerId}>
      <FriendsContent
        userId={viewerId}
        view={data.view}
        page={data.page}
        suggestions={data.suggestions}
      />
    </WorkspaceShell>
  );
}
