import { useEffect, useState } from "react";

import { AccountSettings } from "@/components/account-settings";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type AccountPayload = ApiResponse<"/api/pages/account"> & { viewerId: string };

export default function AccountRoute({ viewerId }: { viewerId: string | null }) {
  const refreshKey = useRouterRefreshKey();
  const [data, setData] = useState<AccountPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matches = data !== null && viewerId !== null && data.viewerId === viewerId;

  useEffect(() => {
    if (!viewerId) {
      return;
    }
    const targetViewer = viewerId;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchApi("/api/pages/account", {});
        if (!cancelled) {
          setError(null);
          setData({ viewerId: targetViewer, ...res });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load account settings");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [viewerId, refreshKey]);

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
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-56" />
        <SkeletonListRows rows={8} />
      </div>
    );
  }

  return (
    <AccountSettings
      user={data.user}
      isPrivate={data.isPrivate}
      journalVisibility={data.journalVisibility}
      sendCommentVisibility={data.sendCommentVisibility}
      tripVisibility={data.tripVisibility}
      climbListVisibility={data.climbListVisibility}
      gradePreferences={data.gradePreferences}
      shareUrl={data.shareUrl}
      turnstileSiteKey={data.turnstileSiteKey}
      catalogExport={data.catalogExport}
      isAdmin={data.isAdmin}
    />
  );
}
