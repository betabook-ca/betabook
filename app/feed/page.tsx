import type { Metadata } from "next";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { FeedList } from "@/components/feed-list";
import { AppLink } from "@/components/ui/app-link";
import { choicePillClass } from "@/components/ui/choice-pill";
import { PageTitle } from "@/components/ui/typography";
import { ViewerBoundary } from "@/components/viewer-boundary";
import { getDb } from "@/db/client";
import { getFriendsPage, getFeedPage } from "@/db/queries";
import { parseFeedView } from "@/lib/feed";
import { getMemberSession as getSession } from "@/lib/session";
import type { UrlParamsRecord } from "@/lib/url-params";

export const metadata: Metadata = { title: "Feed", robots: { index: false } };

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<UrlParamsRecord>;
}) {
  const session = await getSession();
  if (!session) return <CurrentPageAuthCallout />;
  const view = parseFeedView((await searchParams).view);
  const db = await getDb();
  const [page, friends] = await Promise.all([
    getFeedPage(db, session.user.id, view),
    getFriendsPage(db, session.user.id),
  ]);
  return (
    <ViewerBoundary viewerId={session.user.id}>
      <section aria-label="Feed" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <PageTitle>Feed</PageTitle>
            <div className="flex flex-wrap gap-4 text-sm">
              <AppLink href="/friends">Friends</AppLink>
              <AppLink href="/?mode=climber">Find climbers</AppLink>
            </div>
          </div>
          <p className="max-w-3xl text-sm text-muted">
            See what your friends have been climbing. Journal entries and notes appear here only
            when shared with you. Choose what you share in{" "}
            <AppLink href="/account">Account settings</AppLink>.
          </p>
        </div>
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
      </section>
    </ViewerBoundary>
  );
}
