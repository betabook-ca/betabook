import { UserSendsFilterToolbar } from "@/components/filters/sends-filter-toolbar";
import { NavigationPendingProvider } from "@/components/navigation-pending";
import { SectionHeading } from "@/components/ui/typography";
import { UserSendList } from "@/components/user-send-list";
import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getSendsForUserPage, hasUserSends } from "@/db/queries";
import type { UserSendsFilter } from "@/db/queries";
import { getUserHashtags } from "@/db/queries/hashtag-filter";

export async function SendsView({
  userId,
  viewerId,
  filter,
  basePath,
  lockedDateRange = false,
  emptyWindow,
}: {
  userId: string;
  viewerId: string;
  filter: UserSendsFilter;
  basePath: string;
  lockedDateRange?: boolean;
  /** Set when nothing is dated inside the locked dates: the line that says
   * so, in place of filters with nothing to narrow. */
  emptyWindow?: string;
}) {
  const db = await getDb();

  const [hasSends, firstPage, tags] = await Promise.all([
    hasUserSends(db, userId),
    getSendsForUserPage(db, userId, filter, 0, undefined, viewerId),
    getUserHashtags(db, userId, viewerId, true),
  ]);

  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    firstPage.sends.map((send) => send.areaId),
  );

  return (
    <NavigationPendingProvider>
      <div className="flex min-w-0 flex-col gap-4">
        <SectionHeading className="sr-only">Sends</SectionHeading>
        {hasSends && !emptyWindow && (
          <UserSendsFilterToolbar
            filter={filter}
            basePath={basePath}
            tags={tags}
            lockedDateRange={lockedDateRange}
          />
        )}
        <UserSendList
          key={JSON.stringify(filter)}
          userId={userId}
          filter={filter}
          initialSends={firstPage.sends}
          initialHasMore={firstPage.hasMore}
          initialAreaBreadcrumbs={areaBreadcrumbs}
          hasAnySends={hasSends}
          currentUserId={viewerId}
          emptyMessage={emptyWindow}
        />
      </div>
    </NavigationPendingProvider>
  );
}
