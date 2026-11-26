import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import { parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import { searchParamsToRecord } from "@/lib/url-params";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { SpaProfileHeader, SpaSendsView } from "@/spa/lib/profile-shell";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type LoadedUserSends = ApiResponse<"/api/pages/users/{id}/sends"> & {
  targetUserId: string;
  viewerId: string;
  query: string;
};

export default function UserSendsRoute({ viewerId }: { viewerId: string | null }) {
  const params = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const refreshKey = useRouterRefreshKey();
  const userId = params.id ?? "";
  const rawQuery = searchParams.toString();
  const searchRecord = searchParamsToRecord(searchParams);

  const [state, setState] = useState<LoadedUserSends | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches =
    state !== null &&
    viewerId !== null &&
    userId.length > 0 &&
    state.targetUserId === userId &&
    state.viewerId === viewerId &&
    state.query === rawQuery;

  useEffect(() => {
    if (!viewerId || !userId) {
      return;
    }
    const targetUserId = userId;
    const targetViewerId = viewerId;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetchApi("/api/pages/users/{id}/sends", {
          path: { id: targetUserId },
          query: new URLSearchParams(rawQuery),
        });
        if (!cancelled) {
          setError(null);
          setNotFound(false);
          setState({
            targetUserId,
            viewerId: targetViewerId,
            query: rawQuery,
            ...res,
          });
        }
      } catch (err) {
        if (!cancelled) {
          if (isNotFoundError(err)) {
            setNotFound(true);
            setError(null);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load sends");
          }
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [viewerId, userId, rawQuery, refreshKey]);

  usePageTitle(
    notFound ? "Climber not found" : matches && state ? state.user.name + " · Sends" : null,
  );
  if (!viewerId) {
    return <CurrentPageAuthCallout />;
  }
  if (!userId || notFound) {
    return (
      <div className="py-8 text-center">
        <PageTitle>Climber not found</PageTitle>
        <p className="mt-2 text-sm text-muted">No climber profile is available at this URL.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-surface p-6 text-danger">
        {error}
      </div>
    );
  }
  if (!matches || !state) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-56" />
        <SkeletonListRows rows={8} />
      </div>
    );
  }

  return (
    <SpaProfileHeader
      user={state.user}
      isOwner={state.isOwner}
      relationship={state.relationship}
      access={state.access}
      hardest={state.hardest}
    >
      <SpaSendsView
        ownerId={state.user.id}
        viewerId={viewerId}
        filter={parseUserSendsFilter(searchRecord)}
        basePath={`/users/${state.user.id}/sends`}
        data={state.sends}
      />
    </SpaProfileHeader>
  );
}
