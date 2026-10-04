import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { redirectToCanonicalSlug } from "@/app/canonical-slug";
import { getPublicAncestorsById, getPublicAreaById } from "@/app/public-catalog-reads";
import { AreaClimbsSection } from "@/components/area-climbs-section";
import { AreaCragHeader, AreaGradeSpread } from "@/components/area-crag-header";
import { AreaHeaderActions } from "@/components/area-header-actions";
import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { AreaClimbsToolbar } from "@/components/filters/area-climbs-toolbar";
import { NavigationPendingProvider } from "@/components/navigation-pending";
import { SubareaRail } from "@/components/subarea-rail";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { JsonLd } from "@/components/ui/json-ld";
import { SidebarLayout } from "@/components/ui/page-shell";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getAreaBreadcrumbs,
  getAreaWithSubtreeSize,
  getClimbSendStats,
  getSubareas,
  getSubtreeClimbs,
  getSubtreeGradeHistogram,
  getUserSentClimbIds,
  type SubtreeClimbsSort,
  resolveSubareaScope,
} from "@/db/queries";
import {
  type AreaClimbsFilter,
  parseAreaClimbsFilter,
  parseAreaClimbsSort,
  toSubtreeQueryFilter,
} from "@/lib/filters/area-climbs-filter";
import { buildGradeHistogram } from "@/lib/grade-histogram";
import { areaDescription, areaJsonLd, areaTitle, locationTrail, pageMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { areaHref } from "@/lib/slug";
import type { UrlParamsRecord } from "@/lib/url-params";

import { PublicAreaPage } from "./public-area-page";

type AreaPageProps = {
  // Optional catch-all: `slug` is undefined for /areas/:id and a segment
  // array otherwise. The id is authoritative; the redirect normalizes the
  // slug (query string preserved).
  params: Promise<{ id: string; slug?: string[] }>;
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({ params, searchParams }: AreaPageProps): Promise<Metadata> {
  const [{ id, slug }, search] = await Promise.all([params, searchParams]);
  const areaId = Number(id);
  if (!Number.isInteger(areaId)) notFound();

  const area = await getPublicAreaById(areaId);
  if (!area) notFound();
  redirectToCanonicalSlug(slug, area.name, areaHref(area.id, area.name), search);

  const ancestors = await getPublicAncestorsById(area.id);

  const trail = locationTrail(ancestors.map((a) => a.name));
  return {
    ...pageMetadata({
      title: areaTitle(area.name, ancestors.at(-1)?.name ?? null),
      description: areaDescription(area.name, trail, area.description),
      path: areaHref(area.id, area.name),
    }),
    ...(Object.keys(search).length > 0 ? { robots: { index: false } } : {}),
  };
}

export default async function AreaPage({ params, searchParams }: AreaPageProps) {
  const [{ id, slug }, search] = await Promise.all([params, searchParams]);
  const areaId = Number(id);

  if (!Number.isInteger(areaId)) notFound();

  const db = await getDb();
  const session = await getMemberSession();
  if (!session) {
    const area = await getPublicAreaById(areaId);
    if (!area) notFound();
    redirectToCanonicalSlug(slug, area.name, areaHref(area.id, area.name), search);
    return <PublicAreaPage area={area} search={search} />;
  }
  // The ancestor trail is the read generateMetadata already started.
  const [area, ancestors, subareas] = await Promise.all([
    getAreaWithSubtreeSize(db, areaId),
    getPublicAncestorsById(areaId),
    getSubareas(db, areaId),
  ]);
  if (!area) notFound();
  redirectToCanonicalSlug(slug, area.name, areaHref(area.id, area.name), search);

  const sort = parseAreaClimbsSort(search);
  const filter = parseAreaClimbsFilter(search);

  const areaPath = areaHref(area.id, area.name);
  const ancestorNames = ancestors.map((a) => a.name);
  const areaCrumbs = [
    { name: "Home", path: "/" },
    ...ancestors.map((a) => ({ name: a.name, path: areaHref(a.id, a.name) })),
    { name: area.name, path: areaPath },
  ];

  const climbsBlock = (
    <div className="flex flex-col gap-3">
      <SectionHeading>Climbs</SectionHeading>
      <AreaClimbsToolbar areaPath={areaPath} sort={sort} filter={filter} />
      <Suspense fallback={<SkeletonListRows rows={8} />}>
        <AreaClimbs area={area} viewerId={session.user.id} sort={sort} filter={filter} />
      </Suspense>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <JsonLd
        data={areaJsonLd({
          name: area.name,
          path: areaPath,
          description: areaDescription(area.name, locationTrail(ancestorNames), area.description),
          crumbs: areaCrumbs,
          ancestorNames,
        })}
      />
      <AreaBreadcrumbs ancestors={ancestors} current={area} />

      <AreaCragHeader area={area} actions={<AreaHeaderActions area={area} />}>
        {/* The histogram reads every climb row in the subtree, so it follows
         * the same size gate as the list's index strategy — a
         * continent-scale area renders its header without the strip/chart
         * instead of scanning tens of thousands of rows per view. */}
        {!area.largeSubtree && (
          <Suspense fallback={<GradeSpreadLoading />}>
            <AreaGradeSpreadSection area={area} areaPath={areaPath} filter={filter} />
          </Suspense>
        )}
      </AreaCragHeader>

      {/* The provider links the toolbar's in-flight navigation to the climb
       * list it re-fetches, which dims while pending. */}
      <NavigationPendingProvider>
        {subareas.length === 0 ? (
          climbsBlock
        ) : (
          <SidebarLayout
            sidebarWidthClass="lg:w-64"
            sidebar={
              <CollapsibleSection title="Sub-areas" breakpoint="lg">
                <SubareaRail subareas={subareas.map(({ id, name }) => ({ id, name }))} />
              </CollapsibleSection>
            }
          >
            {climbsBlock}
          </SidebarLayout>
        )}
      </NavigationPendingProvider>
    </div>
  );
}

type AreaWithSubtreeSize = NonNullable<Awaited<ReturnType<typeof getAreaWithSubtreeSize>>>;

async function AreaGradeSpreadSection({
  area,
  areaPath,
  filter,
}: {
  area: AreaWithSubtreeSize;
  areaPath: string;
  filter: AreaClimbsFilter;
}) {
  const rows = await getSubtreeGradeHistogram(await getDb(), area);
  return (
    <AreaGradeSpread histogram={buildGradeHistogram(rows)} areaPath={areaPath} filter={filter} />
  );
}

/** Mirrors AreaGradeSpread: the info strip, then the histogram, which
 * collapses to a trigger row below md. */
function GradeSpreadLoading() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-16" rounded="rounded-full" />
      </div>
      <Skeleton className="h-6 w-28 md:hidden" />
      <div className="hidden items-end gap-6 md:flex">
        <Skeleton className="h-20 w-64 max-w-[45%]" />
        <Skeleton className="h-20 w-64 max-w-[45%]" />
      </div>
    </>
  );
}

/** The first page of climbs. AreaClimbsSection fetches later pages itself via
 * "load more" (see app/api/areas/[id]/climbs). */
async function AreaClimbs({
  area,
  viewerId,
  sort,
  filter,
}: {
  area: AreaWithSubtreeSize;
  viewerId: string;
  sort: SubtreeClimbsSort;
  filter: AreaClimbsFilter;
}) {
  const db = await getDb();
  // The sub-area rail can scope the list to one sub-area's subtree; the
  // header, histogram, and rail always describe the whole area.
  const listScope = await resolveSubareaScope(db, area, filter.subareaId);
  const subtreeClimbs = await getSubtreeClimbs(
    db,
    listScope,
    1,
    sort,
    toSubtreeQueryFilter(filter),
  );
  const climbIds = subtreeClimbs.climbs.map((c) => c.id);
  const [sendStats, areaBreadcrumbs, sentClimbIds] = await Promise.all([
    getClimbSendStats(db, climbIds),
    getAreaBreadcrumbs(
      db,
      subtreeClimbs.climbs.map((c) => c.areaId),
    ),
    getUserSentClimbIds(db, viewerId, climbIds),
  ]);

  return (
    <AreaClimbsSection
      // Remounts with fresh initial* state on a sort/filter change rather
      // than syncing "load more" state to changed props via an effect.
      key={JSON.stringify({ sort, filter })}
      areaId={area.id}
      sort={sort}
      filter={filter}
      initialClimbs={subtreeClimbs.climbs}
      initialHasNextPage={subtreeClimbs.hasNextPage}
      initialSendStats={sendStats}
      initialAreaBreadcrumbs={areaBreadcrumbs}
      sentClimbIds={sentClimbIds}
      emptyMessage={
        filter.subareaId != null
          ? "No climbs match in this sub-area."
          : "No climbs found in this area or its sub-areas."
      }
    />
  );
}
