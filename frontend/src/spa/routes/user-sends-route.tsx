import { useParams, useSearchParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/auth/current-page-auth-callout";
import { ClimberNotFound } from "@/components/profile/climber-not-found";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SkeletonListRows } from "@/components/ui/skeleton";
import {
  parseUserSendsFilter,
  userSendsFilterToSearchParams,
} from "@/lib/filters/user-sends-filter";
import { searchParamsToRecord } from "@/lib/url-params";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { SpaSendsView, refineSends } from "@/spa/lib/profile-shell";
import { useRetainedPage } from "@/spa/lib/use-retained-page";
import { useVisitorHeader } from "@/spa/lib/visitor-header";

export default function UserSendsRoute({ viewerId }: { viewerId: string | null }) {
  const { id: userId = "" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const filter = parseUserSendsFilter(searchParamsToRecord(searchParams));
  const query = userSendsFilterToSearchParams(filter).toString();
  const page = useRetainedPage<ApiResponse<"/api/pages/users/{id}/sends">>({
    resource: "user-sends:UserSendsRoute",
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
  useVisitorHeader(page.data, page.error);
  const data = page.data;
  const error =
    page.error instanceof Error ? page.error.message : page.error ? "Failed to load sends" : null;
  usePageTitle(
    isNotFoundError(page.error) ? "Climber not found" : data ? data.user.name + " · Sends" : null,
  );
  if (!viewerId) return <CurrentPageAuthCallout />;
  if (!userId || isNotFoundError(page.error)) return <ClimberNotFound />;
  if (!data && error) return <InlineAlert>{error}</InlineAlert>;
  if (!data) return <SkeletonListRows rows={8} />;
  const committed = parseUserSendsFilter(searchParamsToRecord(new URLSearchParams(page.query)));
  return (
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
  );
}
