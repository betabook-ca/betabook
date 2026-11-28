import { useSearchParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/auth/current-page-auth-callout";
import { FeedActivityNav } from "@/components/feed/feed-activity-nav";
import { FeedList } from "@/components/feed/feed-list";
import { parseFeedView } from "@/lib/feed";
import { fetchApi } from "@/spa/lib/api";
import { useRouter } from "@/spa/lib/navigation";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

export default function FeedRoute({ viewerId }: { viewerId: string | null }) {
  const [searchParams] = useSearchParams();
  const router = useRouter();
  const view = parseFeedView(searchParams.get("view") ?? undefined);
  const { data, error, pending } = useRetainedPage({
    resource: "feed:FeedRoute",
    scope: viewerId,
    query: view,
    load: (signal) => fetchApi("/api/pages/feed", { query: { view }, signal, sessionEvents: true }),
    refine: async (previous, _oldView, signal) => ({
      ...previous,
      view,
      page: await fetchApi("/api/feed", { query: { view }, signal, sessionEvents: true }),
    }),
  });
  if (!viewerId) return <CurrentPageAuthCallout />;
  return (
    <FeedList
      viewerId={viewerId}
      initialPage={data?.page}
      view={data?.view ?? view}
      pending={pending || (!data && !error)}
      error={Boolean(error)}
      onRetry={router.refresh}
      hasFriends={data?.hasFriends ?? false}
      toolbar={<FeedActivityNav view={view} />}
    />
  );
}
