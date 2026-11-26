import { useParams, useSearchParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import { parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import { searchParamsToRecord } from "@/lib/url-params";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError, isUnauthorizedError } from "@/spa/lib/fetch-json";
import { journalFilter, refreshJournalResults } from "@/spa/lib/journal-results";
import {
  refineSends,
  SpaJournalView,
  SpaProfileHeader,
  SpaSendsView,
  SpaSharedProfileView,
} from "@/spa/lib/profile-shell";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

function useProfileTitle(
  current: ApiResponse<"/api/pages/users/{id}"> | null | undefined,
  notFound: boolean,
  unauthorized: boolean,
) {
  const shared = current?.mode === "shared";
  usePageTitle(
    notFound
      ? "Climber not found"
      : unauthorized
        ? "Member content"
        : shared
          ? current.owner.name + " on Betabook"
          : current?.user.name,
    shared && !notFound && !unauthorized,
  );
}

export default function UserProfileRoute({ viewerId }: { viewerId: string | null }) {
  const params = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const userId = params.id ?? "";
  const rawQuery = searchParams.toString();
  const filter = journalFilter(rawQuery);
  const scope = userId ? JSON.stringify([userId, viewerId, searchParams.getAll("share")]) : null;
  const load = (signal: AbortSignal) =>
    fetchApi("/api/pages/users/{id}", { path: { id: userId }, query: searchParams, signal });
  const {
    data,
    query: committed,
    pending,
    error,
  } = useRetainedPage({
    scope,
    query: rawQuery,
    load,
    async refine(previous, previousQuery, signal) {
      if (previous.mode === "shared") return load(signal);
      if (previous.defaultTab === "sends") {
        // This read checks current profile visibility on the server.
        return { ...previous, sends: await refineSends(previous.sends, userId, rawQuery, signal) };
      }
      // A visitor who loses journal access may still be allowed the sends view.
      // The profile loader resolves that fallback and the climb filter's display name.
      if (!previous.isOwner || journalFilter(previousQuery).climbId !== filter.climbId)
        return load(signal);
      return {
        ...previous,
        journal: await refreshJournalResults(userId, previous.journal, rawQuery, signal),
      };
    },
  });
  const notFound = isNotFoundError(error);
  const unauthorized = isUnauthorizedError(error);
  useProfileTitle(data, notFound, unauthorized);
  if (!userId || notFound) {
    return (
      <div className="py-8 text-center">
        <PageTitle>Climber not found</PageTitle>
        <p className="mt-2 text-sm text-muted">No climber profile is available at this URL.</p>
      </div>
    );
  }
  if (unauthorized) {
    return <CurrentPageAuthCallout />;
  }
  const message = error
    ? error instanceof Error
      ? error.message
      : "Could not load the profile."
    : null;
  if (message && (!data || data.mode === "shared")) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-surface p-6 text-danger">
        {message}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-56" />
        <SkeletonListRows rows={8} />
      </div>
    );
  }

  if (data.mode === "shared") {
    return <SpaSharedProfileView payload={data} />;
  }

  const member = data;
  const activeViewerId = viewerId ?? member.user.id;

  return (
    <SpaProfileHeader
      user={member.user}
      isOwner={member.isOwner}
      relationship={member.relationship}
      access={member.access}
      hardest={member.hardest}
    >
      {member.defaultTab === "journal" ? (
        <SpaJournalView
          ownerId={member.user.id}
          isOwner={member.isOwner}
          basePath={`/users/${member.user.id}`}
          filter={filter}
          resultsFilter={journalFilter(committed ?? rawQuery)}
          pending={pending}
          loadError={message}
          data={member.journal}
        />
      ) : (
        <SpaSendsView
          ownerId={member.user.id}
          viewerId={activeViewerId}
          filter={parseUserSendsFilter(searchParamsToRecord(searchParams))}
          resultsFilter={parseUserSendsFilter(
            searchParamsToRecord(new URLSearchParams(committed ?? rawQuery)),
          )}
          pending={pending}
          loadError={message}
          basePath={`/users/${member.user.id}`}
          data={member.sends}
        />
      )}
    </SpaProfileHeader>
  );
}
