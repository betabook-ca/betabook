import { useParams, useSearchParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/auth/current-page-auth-callout";
import { ClimberNotFound } from "@/components/profile/climber-not-found";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { fetchApi } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { journalFilter, refreshJournalResults } from "@/spa/lib/journal-results";
import { SpaJournalView } from "@/spa/lib/profile-shell";
import { useRetainedPage } from "@/spa/lib/use-retained-page";
import { useVisitorHeader } from "@/spa/lib/visitor-header";

export default function UserJournalRoute({ viewerId }: { viewerId: string | null }) {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const query = params.toString();
  const filter = journalFilter(query);
  const load = (signal: AbortSignal) =>
    fetchApi("/api/pages/users/{id}/journal", { path: { id }, query: params, signal });
  const {
    data,
    query: committed,
    pending,
    error,
  } = useRetainedPage({
    resource: "user-journal:UserJournalRoute",
    scope: viewerId && id ? JSON.stringify([viewerId, id]) : null,
    query,
    load,
    async refine(previous, previousQuery, signal) {
      // A different climb needs its display name from the workspace loader.
      if (journalFilter(previousQuery).climbId !== filter.climbId) return load(signal);
      return {
        ...previous,
        journal: await refreshJournalResults(id, previous.journal, query, signal),
      };
    },
  });
  useVisitorHeader(data, error);
  usePageTitle(
    isNotFoundError(error) ? "Climber not found" : data ? data.user.name + " · Journal" : null,
  );
  if (!viewerId) return <CurrentPageAuthCallout />;
  if (!id || isNotFoundError(error))
    return <ClimberNotFound message="No climber profile or journal is available at this URL." />;
  const message = error
    ? error instanceof Error
      ? error.message
      : "Failed to load journal"
    : null;
  if (!data)
    return message ? (
      <InlineAlert>{message}</InlineAlert>
    ) : (
      <SkeletonListRows rows={4} className="max-md:min-h-svh" />
    );
  return (
    <SpaJournalView
      ownerId={id}
      isOwner={data.isOwner}
      filter={filter}
      data={data.journal}
      resultsFilter={journalFilter(committed ?? query)}
      pending={pending}
      loadError={message}
    />
  );
}
