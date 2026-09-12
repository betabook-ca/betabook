import { UserSendsFilterToolbar } from "@/components/filters/sends-filter-toolbar";
import { NavigationPendingProvider } from "@/components/navigation-pending";
import { AppLink } from "@/components/ui/app-link";
import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SidebarLayout } from "@/components/ui/page-shell";
import { StatStrip } from "@/components/ui/stat-strip";
import { SectionHeading } from "@/components/ui/typography";
import { UserSendList } from "@/components/user-send-list";
import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getSendsForUserPage, getUserSendsSummary } from "@/db/queries";
import type { UserSendsFilter } from "@/db/queries";
import { getUserHashtags } from "@/db/queries/hashtag-filter";
import { userSendsFilterToSearchParams } from "@/lib/filters/user-sends-filter";
import { formatCount } from "@/lib/format";
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

  const [summary, firstPage, tags] = await Promise.all([
    getUserSendsSummary(db, userId),
    getSendsForUserPage(db, userId, filter, 0, undefined, viewerId),
    getUserHashtags(db, userId, viewerId, true),
  ]);

  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    firstPage.sends.map((send) => send.areaId),
  );

  const statCards = [
    {
      key: "profile",
      stats: [
        { label: "Sends", value: summary.sendCount },
        { label: "Areas", value: summary.areaCount },
        { label: "Peak grade", value: summary.peakGrade ?? "—" },
      ],
    },
    ...(summary.sendCount > 0
      ? [
          {
            key: "glance",
            heading: <Eyebrow>Log at a glance</Eyebrow>,
            stats: [
              { label: "Latest send", value: formatDate(summary.latestSendDate) },
              ...(summary.mostLoggedDiscipline
                ? [
                    {
                      label: "Most logged",
                      value: `${DISCIPLINE_LABELS[summary.mostLoggedDiscipline.type]} · ${formatCount(summary.mostLoggedDiscipline.count, "send")}`,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
  ];

  return (
    <NavigationPendingProvider>
      <div className="flex flex-col gap-3">
        <SectionHeading>Sends</SectionHeading>
        <SidebarLayout sidebar={<StatStrip cards={statCards} />}>
          <div className="flex flex-col gap-3">
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
            {summary.sendCount > 0 && (
              <UserSendsFilterToolbar filter={filter} basePath={basePath} tags={tags} />
            )}
            <UserSendList
              key={JSON.stringify(filter)}
              userId={userId}
              filter={filter}
              initialSends={firstPage.sends}
              initialHasMore={firstPage.hasMore}
              initialAreaBreadcrumbs={areaBreadcrumbs}
              hasAnySends={summary.sendCount > 0}
              currentUserId={viewerId}
            />
          </div>
        </SidebarLayout>
      </div>
    </NavigationPendingProvider>
  );
}
