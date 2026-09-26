import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
import { ClimbJournalCard, LogEntryButton } from "@/components/journal";
import { LoggedGradeHistogram } from "@/components/logged-grade-histogram";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { JsonLd } from "@/components/ui/json-ld";
import { SidebarLayout } from "@/components/ui/page-shell";
import { RatingStars } from "@/components/ui/rating-stars";
import { StatStrip } from "@/components/ui/stat-strip";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getAncestors,
  getArea,
  getClimb,
  getClimbSendSummary,
  getJournalForClimb,
  getSendsForClimb,
  getUserSendForClimb,
} from "@/db/queries";
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

  // Stats come from whole-history aggregates and the list from a paginated
  // query — a popular climb's full send history never ships in the RSC
  // payload (ClimbSendList "load more"-fetches the rest on demand).
  const [area, userSend, sendsPage, summary, journalEntries] = await Promise.all([
    getArea(db, climb.areaId),
    getUserSendForClimb(db, session.user.id, climb.id),
    getSendsForClimb(db, climb.id, 0, undefined, session.user.id),
    getClimbSendSummary(db, climb.id),
    getJournalForClimb(db, session.user.id, session.user.id, climb.id),
  ]);
  if (!area) notFound();

  const ancestors = await getAncestors(db, area);

  const trail = locationTrail([...ancestors.map((a) => a.name), area.name]);
  const breadcrumbCrumbs = [
    { name: "Home", path: "/" },
    ...ancestors.map((a) => ({ name: a.name, path: areaHref(a.id, a.name) })),
    { name: area.name, path: areaHref(area.id, area.name) },
    { name: climb.name, path: climbHref(climb.id, climb.name) },
  ];

  const loggedBreakdown = Object.entries(summary.styleBreakdown).filter(([, count]) => count > 0);
  const loggedGradeRows = buildLoggedGradeRows(
    climb.type,
    summary.suggestedGradeCounts,
    climb.grade,
  );

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
        }
      >
        <div className="flex flex-col gap-6">
          <ClimbJournalCard userId={session.user.id} climbId={climb.id} entries={journalEntries} />
          <div className="flex flex-col gap-3">
            <SectionHeading>Sends</SectionHeading>
            <ClimbSendList
              climb={climb}
              initialSends={sendsPage.sends}
              initialHasMore={sendsPage.hasMore}
              currentUserId={session.user.id}
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
