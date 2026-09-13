import { UserSendsFilterToolbar } from "@/components/filters/sends-filter-toolbar";
import { NavigationPendingProvider } from "@/components/navigation-pending";
import { AppLink } from "@/components/ui/app-link";
import { SectionHeading } from "@/components/ui/typography";
import { UserSendList } from "@/components/user-send-list";
import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getSendsForUserPage, hasUserSends } from "@/db/queries";
import type { UserSendsFilter } from "@/db/queries";
import { getUserHashtags } from "@/db/queries/hashtag-filter";
import { userSendsFilterToSearchParams } from "@/lib/filters/user-sends-filter";
import { formatDate } from "@/lib/format-date";

export async function SendsView({
  userId,
  viewerId,
  filter,
  basePath,
}: {
  userId: string;
  viewerId: string;
  filter: UserSendsFilter;
  basePath: string;
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
        {(filter.date || filter.dateFrom || filter.dateTo) && (
          <p className="text-sm text-muted">
            {filter.date
              ? formatDate(filter.date)
              : `${filter.dateFrom ? formatDate(filter.dateFrom) : "Any time"} – ${filter.dateTo ? formatDate(filter.dateTo) : "Any time"}`}{" "}
            ·{" "}
            <AppLink
              href={`${basePath}?${userSendsFilterToSearchParams({ ...filter, date: undefined, dateFrom: undefined, dateTo: undefined, datePreset: undefined })}`}
            >
              Clear date filter
            </AppLink>
          </p>
        )}
        {hasSends && <UserSendsFilterToolbar filter={filter} basePath={basePath} tags={tags} />}
        <UserSendList
          key={JSON.stringify(filter)}
          userId={userId}
          filter={filter}
          initialSends={firstPage.sends}
          initialHasMore={firstPage.hasMore}
          initialAreaBreadcrumbs={areaBreadcrumbs}
          hasAnySends={hasSends}
          currentUserId={viewerId}
        />
      </div>
    </NavigationPendingProvider>
  );
}
