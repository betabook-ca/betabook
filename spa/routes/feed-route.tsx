import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { FeedActivityNav } from "@/components/feed-activity-nav";
import { FeedList } from "@/components/feed-list";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { WorkspaceShell } from "@/components/workspace-shell";
import type { FeedPage } from "@/db/queries";
import { parseFeedView, type FeedView } from "@/lib/feed";
import { fetchJson } from "@/spa/lib/fetch-json";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type FeedPayload = {
  viewerId: string;
  view: FeedView;
  page: FeedPage;
  hasFriends: boolean;
};

export default function FeedRoute({ viewerId }: { viewerId: string | null }) {
  const [searchParams] = useSearchParams();
  const refreshKey = useRouterRefreshKey();
  const view = parseFeedView(searchParams.get("view") ?? undefined);

  const [data, setData] = useState<FeedPayload | null>(null);
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
        const res = await fetchJson<{ view: FeedView; page: FeedPage; hasFriends: boolean }>(
          `/api/pages/feed?view=${encodeURIComponent(view)}`,
        );
        if (!cancelled) {
          setError(null);
          setData({ viewerId: targetViewer, ...res });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load feed");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [viewerId, view, refreshKey]);

  if (!viewerId) {
    return <CurrentPageAuthCallout />;
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
      <FeedList
        viewerId={viewerId}
        key={`${viewerId}:${data.view}`}
        initialPage={data.page}
        view={data.view}
        hasFriends={data.hasFriends}
        toolbar={<FeedActivityNav key="feed-activity" view={data.view} />}
      />
    </WorkspaceShell>
  );
}
