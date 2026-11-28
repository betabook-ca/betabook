import { useSearchParams } from "react-router";

import { AuthCallout } from "@/components/auth/auth-callout";
import { FriendsContent } from "@/components/friends/friends-content";
import { parseFriendsView } from "@/lib/friendships";
import { fetchApi } from "@/spa/lib/api";
import { useRouter } from "@/spa/lib/navigation";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

export default function FriendsRoute({ viewerId }: { viewerId: string | null }) {
  const [searchParams] = useSearchParams();
  const router = useRouter();
  const view = parseFriendsView(searchParams.get("view") ?? undefined);
  const load = (signal: AbortSignal) =>
    fetchApi("/api/pages/friends", { query: { view }, signal, sessionEvents: true });
  const { data, error, pending } = useRetainedPage({
    resource: "friends:FriendsRoute",
    scope: viewerId,
    query: view,
    load,
    refine: async (previous, _oldView, signal) => {
      if (view === "friends" && previous.suggestions === null) return load(signal);
      const page = await fetchApi("/api/friends", { query: { view }, signal, sessionEvents: true });
      if (!("friends" in page)) throw new Error("Couldn’t load friends.");
      return { ...previous, view, page };
    },
  });
  if (!viewerId)
    return <AuthCallout next={view === "friends" ? "/friends" : "/friends?view=requests"} />;
  return (
    <FriendsContent
      userId={viewerId}
      view={view}
      resultsView={data?.view}
      page={data?.page}
      suggestions={data?.suggestions ?? null}
      pending={pending || (!data && !error)}
      error={Boolean(error)}
      onRetry={router.refresh}
    />
  );
}
