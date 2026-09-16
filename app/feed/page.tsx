import type { Metadata } from "next";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { FeedList } from "@/components/feed-list";
import { AppLink } from "@/components/ui/app-link";
import { choicePillClass } from "@/components/ui/choice-pill";
import { ViewerBoundary } from "@/components/viewer-boundary";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getDb } from "@/db/client";
import { getFriendsPage, getFeedPage } from "@/db/queries";
import { parseFeedView } from "@/lib/feed";
import { getMemberSession } from "@/lib/session";
import type { UrlParamsRecord } from "@/lib/url-params";

export const metadata: Metadata = { title: "Feed", robots: { index: false } };

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<UrlParamsRecord>;
}) {
  const session = await getMemberSession();
  if (!session) return <CurrentPageAuthCallout />;
  const view = parseFeedView((await searchParams).view);
  const db = await getDb();
  const [page, friends] = await Promise.all([
    getFeedPage(db, session.user.id, view),
    getFriendsPage(db, session.user.id),
  ]);
  return (
    <ViewerBoundary viewerId={session.user.id}>
      <WorkspaceShell area="community" userId={session.user.id}>
        <FeedList
          viewerId={session.user.id}
          key={`${session.user.id}:${view}`}
          initialPage={page}
          view={view}
          hasFriends={friends.friends.length > 0}
          toolbar={
            <nav key="feed-activity" aria-label="Feed activity" className="flex gap-2">
              {(["all", "sends"] as const).map((value) => (
                <AppLink
                  key={value}
                  href={`/feed?view=${value}`}
                  className={choicePillClass(value === view, "bg-foreground text-background")}
                  aria-current={value === view ? "page" : undefined}
                >
                  {value === "all" ? "All activity" : "Sends"}
                </AppLink>
              ))}
            </nav>
          }
        />
      </WorkspaceShell>
    </ViewerBoundary>
  );
}
