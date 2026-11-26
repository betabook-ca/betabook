import { useParams, useSearchParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import {
  parseUserSendsFilter,
  userSendsFilterToSearchParams,
} from "@/lib/filters/user-sends-filter";
import { searchParamsToRecord } from "@/lib/url-params";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { SpaProfileHeader, SpaSendsView, refineSends } from "@/spa/lib/profile-shell";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

export default function UserSendsRoute({ viewerId }: { viewerId: string | null }) {
  const { id: userId = "" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const filter = parseUserSendsFilter(searchParamsToRecord(searchParams));
  const query = userSendsFilterToSearchParams(filter).toString();
  const page = useRetainedPage<ApiResponse<"/api/pages/users/{id}/sends">>({
    scope: viewerId && userId ? JSON.stringify([viewerId, userId]) : null,
    query,
    load: (signal) =>
      fetchApi("/api/pages/users/{id}/sends", {
        path: { id: userId },
        query: new URLSearchParams(query),
        signal,
        sessionEvents: true,
      }),
    async refine(previous, _previousQuery, signal) {
      return { ...previous, sends: await refineSends(previous.sends, userId, query, signal) };
    },
  });
  const data = page.data;
  const error =
    page.error instanceof Error ? page.error.message : page.error ? "Failed to load sends" : null;
  usePageTitle(
    isNotFoundError(page.error) ? "Climber not found" : data ? data.user.name + " · Sends" : null,
  );
  if (!viewerId) return <CurrentPageAuthCallout />;
  if (!userId || isNotFoundError(page.error))
    return (
      <div className="py-8 text-center">
        <PageTitle>Climber not found</PageTitle>
        <p className="mt-2 text-sm text-muted">No climber profile is available at this URL.</p>
      </div>
    );
  if (!data && error) return <p role="alert">{error}</p>;
  if (!data)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-56" />
        <SkeletonListRows rows={8} />
      </div>
    );
  const committed = parseUserSendsFilter(searchParamsToRecord(new URLSearchParams(page.query)));
  return (
    <SpaProfileHeader
      user={data.user}
      isOwner={data.isOwner}
      relationship={data.relationship}
      access={data.access}
      hardest={data.hardest}
    >
      <SpaSendsView
        ownerId={userId}
        viewerId={viewerId}
        filter={filter}
        resultsFilter={committed}
        pending={page.pending}
        loadError={error}
        basePath={`/users/${userId}/sends`}
        data={data.sends}
      />
    </SpaProfileHeader>
  );
}
