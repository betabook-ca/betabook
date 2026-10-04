import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { redirectToCanonicalSlug } from "@/app/canonical-slug";
import {
  getPublicAncestorsById,
  getPublicAreaById,
  getPublicClimbById,
} from "@/app/public-catalog-reads";
import { ASCENT_STYLE_LABELS } from "@/components/ascent-style";
import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { ClimbActionsMenu } from "@/components/climb-actions-menu";
import { ClimbDescription } from "@/components/climb-description";
import { GradeWithTrend } from "@/components/climb-list";
import { ClimbSendList } from "@/components/climb-send-list";
import { ClimbVideoShelf } from "@/components/climb-video-shelf";
import { ClimbJournalCard, LogEntryButton } from "@/components/journal";
import { LoggedGradeHistogram } from "@/components/logged-grade-histogram";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { JsonLd } from "@/components/ui/json-ld";
import { SidebarLayout } from "@/components/ui/page-shell";
import { RatingStars } from "@/components/ui/rating-stars";
import { SkeletonListRows, SkeletonStatCard } from "@/components/ui/skeleton";
import { StatStrip } from "@/components/ui/stat-strip";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getClimb,
  getClimbSendSummary,
  getClimbVideos,
  getJournalForClimb,
  getSendsForClimb,
  getUserSendForClimb,
} from "@/db/queries";
import type { Climb } from "@/db/queries/climbs";
import { buildLoggedGradeRows } from "@/lib/grade-histogram";
import type { AscentStyle as AscentStyleType } from "@/lib/sends";
import { climbDescription, climbJsonLd, climbTitle, locationTrail, pageMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { areaHref, climbHref } from "@/lib/slug";
import type { UrlParamsRecord } from "@/lib/url-params";

import { ClimbHeader } from "./climb-header";
import { PublicClimbPage } from "./public-climb-page";

type ClimbPageProps = {
  // Optional catch-all: `slug` is undefined for /climbs/:id and a segment
  // array for /climbs/:id/anything. The id is authoritative; the slug is
  // decorative and normalized by redirectToCanonicalSlug.
  params: Promise<{ id: string; slug?: string[] }>;
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({
  params,
  searchParams,
}: ClimbPageProps): Promise<Metadata> {
  const [{ id, slug }, search] = await Promise.all([params, searchParams]);
  const climbId = Number(id);
  if (!Number.isInteger(climbId)) notFound();

  const climb = await getPublicClimbById(climbId);
  if (!climb) notFound();
  redirectToCanonicalSlug(slug, climb.name, climbHref(climb.id, climb.name), search);

  const [area, ancestors] = await Promise.all([
    getPublicAreaById(climb.areaId),
    getPublicAncestorsById(climb.areaId),
  ]);
  if (!area) notFound();

  const trail = locationTrail([...ancestors.map((a) => a.name), area.name]);
  return pageMetadata({
    title: climbTitle(climb, area.name),
    description: climbDescription(climb, trail),
    path: climbHref(climb.id, climb.name),
    ogType: "article",
  });
}

export default async function ClimbPage({ params, searchParams }: ClimbPageProps) {
  const [{ id, slug }, search] = await Promise.all([params, searchParams]);
  const climbId = Number(id);

  if (!Number.isInteger(climbId)) notFound();

  const session = await getMemberSession();
  if (!session) {
    const climb = await getPublicClimbById(climbId);
    if (!climb) notFound();
    redirectToCanonicalSlug(slug, climb.name, climbHref(climb.id, climb.name), search);
    return <PublicClimbPage climb={climb} search={search} />;
  }
  const db = await getDb();
  const climb = await getClimb(db, climbId);
  if (!climb) notFound();
  redirectToCanonicalSlug(slug, climb.name, climbHref(climb.id, climb.name), search);

  // The area trail is the read generateMetadata already started.
  const [area, ancestors, userSend, journalEntries] = await Promise.all([
    getPublicAreaById(climb.areaId),
    getPublicAncestorsById(climb.areaId),
    getUserSendForClimb(db, session.user.id, climb.id),
    getJournalForClimb(db, session.user.id, session.user.id, climb.id),
  ]);
  if (!area) notFound();

  const trail = locationTrail([...ancestors.map((a) => a.name), area.name]);
  const breadcrumbCrumbs = [
    { name: "Home", path: "/" },
    ...ancestors.map((a) => ({ name: a.name, path: areaHref(a.id, a.name) })),
    { name: area.name, path: areaHref(area.id, area.name) },
    { name: climb.name, path: climbHref(climb.id, climb.name) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <JsonLd
        data={climbJsonLd({
          name: climb.name,
          path: climbHref(climb.id, climb.name),
          description: climbDescription(climb, trail),
          crumbs: breadcrumbCrumbs,
        })}
      />
      <AreaBreadcrumbs ancestors={[...ancestors, area]} current={climb} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ClimbHeader climb={climb} eyebrow="Climb">
          <ClimbDescription climb={climb} />
        </ClimbHeader>
        <div className="flex shrink-0 items-center gap-2">
          <LogEntryButton climb={climb} sentClimbIds={userSend ? new Set([climb.id]) : undefined} />
          <ClimbActionsMenu climb={climb} send={userSend} />
        </div>
      </div>

      <SidebarLayout
        side="left"
        sidebarWidthClass="lg:w-80"
        sidebar={
          <Suspense
            fallback={
              <>
                <SkeletonStatCard stats={3} />
                <SkeletonStatCard stats={2} />
              </>
            }
          >
            <ClimbStats climb={climb} />
          </Suspense>
        }
      >
        <div className="flex flex-col gap-6">
          <ClimbJournalCard userId={session.user.id} climbId={climb.id} entries={journalEntries} />
          <Suspense
            fallback={
              <div className="flex flex-col gap-3">
                <SectionHeading>Sends</SectionHeading>
                <SkeletonListRows rows={5} />
              </div>
            }
          >
            <ClimbSends climb={climb} viewerId={session.user.id} />
          </Suspense>
        </div>
      </SidebarLayout>
    </div>
  );
}

/** Whole-history aggregates for the sidebar. */
async function ClimbStats({ climb }: { climb: Climb }) {
  const summary = await getClimbSendSummary(await getDb(), climb.id);
  const loggedBreakdown = Object.entries(summary.styleBreakdown).filter(([, count]) => count > 0);
  const loggedGradeRows = buildLoggedGradeRows(
    climb.type,
    summary.suggestedGradeCounts,
    climb.grade,
  );
  return (
    <>
      <StatStrip
        cards={[
          {
            key: "summary",
            stats: [
              {
                label: "Community rating",
                value: <RatingStars rating={summary.avgRating} precision="decimal" />,
              },
              { label: "Logged ascents", value: summary.sendCount },
              ...(summary.avgSuggestedGrade != null
                ? [
                    {
                      label: "Suggested grade",
                      value: (
                        <GradeWithTrend
                          type={climb.type}
                          grade={climb.grade}
                          avgSuggestedGrade={summary.avgSuggestedGrade}
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
                    label: ASCENT_STYLE_LABELS[type as AscentStyleType],
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
          <LoggedGradeHistogram type={climb.type} rows={loggedGradeRows} />
        </div>
      )}
    </>
  );
}

/** The video shelf and the first page of sends; ClimbSendList fetches later
 * pages on demand, so a popular climb's full history never ships here. */
async function ClimbSends({ climb, viewerId }: { climb: Climb; viewerId: string }) {
  const db = await getDb();
  const [sendsPage, videos] = await Promise.all([
    getSendsForClimb(db, climb.id, 0, undefined, viewerId),
    getClimbVideos(db, climb.id, viewerId),
  ]);
  return (
    <>
      <ClimbVideoShelf videos={videos.videos} total={videos.total} climbName={climb.name} />
      <div className="flex flex-col gap-3">
        <SectionHeading>Sends</SectionHeading>
        <ClimbSendList
          climb={climb}
          initialSends={sendsPage.sends}
          initialHasMore={sendsPage.hasMore}
          currentUserId={viewerId}
          emptyState={
            <EmptyState message="No sends yet — this line is waiting for its first ascent." />
          }
        />
      </div>
    </>
  );
}
