import { useParams, useSearchParams } from "react-router";

import { LoggedGradeHistogram } from "@/components/analytics/logged-grade-histogram";
import { AreaBreadcrumbs } from "@/components/areas/breadcrumbs";
import { AddToListButton } from "@/components/climb-lists/add-to-list-button";
import { useGradePreferences } from "@/components/climbing/grade-preferences";
import { GradeWithTrend } from "@/components/climbing/grade-with-trend";
import { RatingStars } from "@/components/climbing/rating-stars";
import { ClimbActionsMenu } from "@/components/climbs/climb-actions-menu";
import { ClimbDescription } from "@/components/climbs/climb-description";
import { ClimbHeader } from "@/components/climbs/climb-header";
import { ClimbVideoShelf } from "@/components/climbs/climb-video-shelf";
import { ClimbJournalCard, LogEntryButton } from "@/components/journal";
import { ClimbSendList } from "@/components/sends/climb-send-list";
import { PublicClimbSendList } from "@/components/sends/public-climb-send-list";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InlineAlert } from "@/components/ui/inline-alert";
import { NotFoundMessage } from "@/components/ui/not-found-message";
import { SidebarLayout } from "@/components/ui/page-shell";
import { SkeletonEntityPage } from "@/components/ui/skeleton";
import { StatStrip } from "@/components/ui/stat-strip";
import { SectionHeading } from "@/components/ui/typography";
import { missingDescriptionMessage } from "@/lib/descriptions";
import { buildLoggedGradeRows } from "@/lib/grade-histogram";
import { formatGrade } from "@/lib/grades";
import { ASCENT_STYLE_LABELS, type AscentStyle } from "@/lib/sends";
import { climbHref, withQuery } from "@/lib/slug";
import { searchParamsToRecord } from "@/lib/url-params";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError, parsePositiveId, type ClimbPageData } from "@/spa/lib/fetch-json";
import { usePathname } from "@/spa/lib/navigation";
import { usePublicEntryReady } from "@/spa/lib/public-entry";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

type MemberClimbPayload = ApiResponse<"/api/pages/climbs/{id}"> & { climbId: number };

function ClimbNotFoundView() {
  return (
    <NotFoundMessage
      heading="Climb not found"
      message="No route or boulder problem exists at this URL."
    />
  );
}

function ClimbErrorBanner({ error }: { error: string }) {
  return <InlineAlert>{error}</InlineAlert>;
}

function PublicClimbView({ climbId }: { climbId: number }) {
  const pathname = usePathname();
  const [searchParams] = useSearchParams();
  const page = useRetainedPage<ClimbPageData>({
    resource: "climb:PublicClimbView",
    scope: String(climbId),
    query: "",
    initial: () => {
      const seed = peekBootstrapData("climb", pathname) as ClimbPageData | null;
      return seed?.climbId === climbId ? seed : null;
    },
    async load(signal) {
      const result = await fetchApi("/api/public/climbs/{id}", {
        path: { id: String(climbId) },
        signal,
      });
      return { ...result, climbId };
    },
  });
  const data = page.data;
  const notFound = isNotFoundError(page.error);
  const error =
    page.error instanceof Error ? page.error.message : page.error ? "Failed to load climb" : null;
  const loaded = data?.climbId === climbId ? data : null;
  const grade = loaded && formatGrade(loaded.climb.type, loaded.climb.grade);
  usePublicEntryReady(Boolean(data || error));
  usePageTitle(
    notFound
      ? "Climb not found"
      : loaded
        ? [loaded.climb.name, grade === "—" ? null : grade, loaded.area?.name]
            .filter(Boolean)
            .join(" · ")
        : null,
  );
  if (notFound) return <ClimbNotFoundView />;
  if (error) return <ClimbErrorBanner error={error} />;
  if (!data) return <SkeletonEntityPage rows={6} />;

  const path = climbHref(data.climb.id, data.climb.name);
  const breadcrumbAncestors = data.area ? [...data.ancestors, data.area] : data.ancestors;
  const searchRecord = searchParamsToRecord(searchParams);

  return (
    <div className="flex flex-col gap-6">
      <AreaBreadcrumbs ancestors={breadcrumbAncestors} current={data.climb} />
      <ClimbHeader climb={data.climb}>
        <p className="mt-1 text-muted">{data.climb.description || missingDescriptionMessage()}</p>
      </ClimbHeader>
      <StatStrip
        cards={[
          {
            key: "summary",
            stats: [
              {
                label: "Community rating",
                value: <RatingStars rating={data.climb.avgRating} precision="decimal" />,
              },
              { label: "Logged ascents", value: data.climb.sendCount },
            ],
          },
        ]}
      />
      <ClimbVideoShelf
        videos={data.videos.videos}
        total={data.videos.total}
        climbName={data.climb.name}
      />
      <div className="flex flex-col gap-3">
        <SectionHeading>Sends</SectionHeading>
        <PublicClimbSendList
          type={data.climb.type}
          climbName={data.climb.name}
          sends={data.publicSends}
          next={withQuery(path, searchRecord)}
        />
      </div>
    </div>
  );
}

function MemberClimbView({ climbId, viewerId }: { climbId: number; viewerId: string }) {
  const prefs = useGradePreferences();
  const page = useRetainedPage<MemberClimbPayload>({
    resource: "climb:MemberClimbView",
    scope: JSON.stringify([viewerId, climbId]),
    query: "",
    async load(signal) {
      const result = await fetchApi("/api/pages/climbs/{id}", {
        path: { id: String(climbId) },
        signal,
        sessionEvents: true,
      });
      return { ...result, climbId };
    },
  });
  const data = page.data;
  const notFound = isNotFoundError(page.error);
  const error =
    page.error instanceof Error ? page.error.message : page.error ? "Failed to load climb" : null;
  const loaded = data?.climbId === climbId ? data : null;
  const grade = loaded && formatGrade(loaded.climb.type, loaded.climb.grade);
  usePublicEntryReady(Boolean(data || error));
  usePageTitle(
    notFound
      ? "Climb not found"
      : loaded
        ? [loaded.climb.name, grade === "—" ? null : grade, loaded.area?.name]
            .filter(Boolean)
            .join(" · ")
        : null,
  );
  if (notFound) return <ClimbNotFoundView />;
  if (error) return <ClimbErrorBanner error={error} />;
  if (!data) return <SkeletonEntityPage rows={6} />;

  const breadcrumbAncestors = data.area ? [...data.ancestors, data.area] : data.ancestors;
  const loggedBreakdown = Object.entries(data.summary.styleBreakdown).filter(([, c]) => c > 0);
  const loggedGradeRows = buildLoggedGradeRows(
    data.climb.type,
    data.summary.suggestedGradeCounts,
    data.climb.grade,
    prefs,
  );

  return (
    <div className="flex flex-col gap-6">
      <AreaBreadcrumbs ancestors={breadcrumbAncestors} current={data.climb} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ClimbHeader climb={data.climb} eyebrow="Climb">
          <ClimbDescription climb={data.climb} />
        </ClimbHeader>
        <div className="flex shrink-0 items-center gap-2">
          <LogEntryButton
            climb={data.climb}
            sentClimbIds={data.userSend ? new Set([data.climb.id]) : undefined}
          />
          <AddToListButton climb={data.climb} viewerId={viewerId} />
          <ClimbActionsMenu climb={data.climb} send={data.userSend ?? undefined} />
        </div>
      </div>

      <ClimbJournalCard userId={viewerId} climbId={data.climb.id} entries={data.journalEntries} />

      <SidebarLayout
        side="left"
        sidebarWidthClass="lg:w-80"
        sidebar={
          <>
            <StatStrip
              cards={[
                {
                  key: "summary",
                  stats: [
                    {
                      label: "Community rating",
                      value: <RatingStars rating={data.summary.avgRating} precision="decimal" />,
                    },
                    { label: "Logged ascents", value: data.summary.sendCount },
                    ...(data.summary.avgSuggestedGrade != null
                      ? [
                          {
                            label: "Suggested grade",
                            value: (
                              <GradeWithTrend
                                type={data.climb.type}
                                grade={data.climb.grade}
                                avgSuggestedGrade={data.summary.avgSuggestedGrade}
                              />
                            ),
                          },
                        ]
                      : []),
                  ],
                },
                ...(loggedBreakdown.length > 0
                  ? [
                      {
                        key: "breakdown",
                        heading: <Eyebrow>Ascent breakdown</Eyebrow>,
                        stats: loggedBreakdown.map(([type, count]) => ({
                          label: ASCENT_STYLE_LABELS[type as AscentStyle],
                          value: count,
                        })),
                      },
                    ]
                  : []),
              ]}
            />
            {loggedGradeRows.length > 0 && (
              <div className={cardClass("sm")}>
                <div className="mb-3">
                  <Eyebrow as="h2">Logged grades</Eyebrow>
                </div>
                <LoggedGradeHistogram type={data.climb.type} rows={loggedGradeRows} />
              </div>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <ClimbVideoShelf
            videos={data.videos.videos}
            total={data.videos.total}
            climbName={data.climb.name}
          />
          <div className="flex flex-col gap-3">
            <SectionHeading>Sends</SectionHeading>
            <ClimbSendList
              climb={data.climb}
              initialSends={data.sendsPage.sends}
              initialHasMore={data.sendsPage.hasMore}
              currentUserId={viewerId}
              emptyState={
                <EmptyState message="No sends yet — this line is waiting for its first ascent." />
              }
            />
          </div>
        </div>
      </SidebarLayout>
    </div>
  );
}

export default function ClimbRoute({ viewerId }: { viewerId: string | null }) {
  const params = useParams<{ id?: string }>();
  const climbId = parsePositiveId(params.id);

  if (climbId === null) {
    return <ClimbNotFoundView />;
  }

  return viewerId !== null ? (
    <MemberClimbView climbId={climbId} viewerId={viewerId} />
  ) : (
    <PublicClimbView climbId={climbId} />
  );
}
