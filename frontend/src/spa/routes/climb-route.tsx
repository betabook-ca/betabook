import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { ClimbActionsMenu } from "@/components/climb-actions-menu";
import { ClimbDescription } from "@/components/climb-description";
import { ClimbHeader } from "@/components/climb-header";
import { AddToListButton } from "@/components/climb-lists/add-to-list-button";
import { ClimbSendList } from "@/components/climb-send-list";
import { ClimbVideoShelf } from "@/components/climb-video-shelf";
import { GradeWithTrend } from "@/components/grade-with-trend";
import { ClimbJournalCard, LogEntryButton } from "@/components/journal";
import { LoggedGradeHistogram } from "@/components/logged-grade-histogram";
import { PublicClimbSendList } from "@/components/public-climb-send-list";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useGradePreferences } from "@/components/ui/grade-preferences";
import { SidebarLayout } from "@/components/ui/page-shell";
import { RatingStars } from "@/components/ui/rating-stars";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { StatStrip } from "@/components/ui/stat-strip";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
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
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type MemberClimbPayload = ApiResponse<"/api/pages/climbs/{id}"> & { climbId: number };

function ClimbLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-9 w-72" />
      <SkeletonListRows rows={6} />
    </div>
  );
}

function ClimbNotFoundView() {
  return (
    <div className="py-8 text-center">
      <PageTitle>Climb not found</PageTitle>
      <p className="mt-2 text-sm text-muted">No route or boulder problem exists at this URL.</p>
    </div>
  );
}

function ClimbErrorBanner({ error }: { error: string }) {
  return (
    <div role="alert" className="rounded-lg border border-border bg-surface p-6 text-danger">
      {error}
    </div>
  );
}

function PublicClimbView({ climbId }: { climbId: number }) {
  const pathname = usePathname();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<ClimbPageData | null>(() => {
    const bootstrapped = peekBootstrapData("climb", pathname) as ClimbPageData | null;
    return bootstrapped && bootstrapped.climbId === climbId ? bootstrapped : null;
  });
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = data !== null && data.climbId === climbId;

  useEffect(() => {
    if (matches) {
      return;
    }
    let cancelled = false;
    async function loadPublic() {
      try {
        const res = await fetchApi("/api/public/climbs/{id}", { path: { id: String(climbId) } });
        if (!cancelled) {
          setError(null);
          setNotFound(false);
          setData({
            climbId,
            climb: res.climb,
            area: res.area,
            ancestors: res.ancestors,
            publicSends: res.publicSends,
            videos: res.videos ?? { videos: [], total: 0 },
          });
        }
      } catch (err) {
        if (!cancelled) {
          if (isNotFoundError(err)) {
            setNotFound(true);
            setError(null);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load climb");
          }
        }
      }
    }
    void loadPublic();
    return () => {
      cancelled = true;
    };
  }, [climbId, matches]);

  const loaded = data?.climbId === climbId ? data : null;
  const grade = loaded && formatGrade(loaded.climb.type, loaded.climb.grade);
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
  if (!matches || !data) return <ClimbLoadingSkeleton />;

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
  const refreshKey = useRouterRefreshKey();
  const prefs = useGradePreferences();
  const [data, setData] = useState<MemberClimbPayload | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = data !== null && data.climbId === climbId;

  useEffect(() => {
    let cancelled = false;
    async function loadMember() {
      try {
        const payload = await fetchApi("/api/pages/climbs/{id}", { path: { id: String(climbId) } });
        if (!cancelled) {
          setError(null);
          setNotFound(false);
          setData({ climbId, ...payload });
        }
      } catch (err) {
        if (!cancelled) {
          if (isNotFoundError(err)) {
            setNotFound(true);
            setError(null);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load climb");
          }
        }
      }
    }
    void loadMember();
    return () => {
      cancelled = true;
    };
  }, [climbId, viewerId, refreshKey]);

  const loaded = data?.climbId === climbId ? data : null;
  const grade = loaded && formatGrade(loaded.climb.type, loaded.climb.grade);
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
  if (!matches || !data) return <ClimbLoadingSkeleton />;

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
                  <Eyebrow>Logged grades</Eyebrow>
                </div>
                <LoggedGradeHistogram type={data.climb.type} rows={loggedGradeRows} />
              </div>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <ClimbJournalCard
            userId={viewerId}
            climbId={data.climb.id}
            entries={data.journalEntries}
          />
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
