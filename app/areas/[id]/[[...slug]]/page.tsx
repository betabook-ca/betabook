import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { AreaClimbsSection } from "@/components/area-climbs-section";
import { AreaCragHeader } from "@/components/area-crag-header";
import { AreaHeaderActions } from "@/components/area-header-actions";
import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { AreaClimbsToolbar } from "@/components/filters/area-climbs-toolbar";
import { NavigationPendingProvider } from "@/components/navigation-pending";
import { RegisterSearchScope } from "@/components/search-scope";
import { SubareaRail } from "@/components/subarea-rail";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { JsonLd } from "@/components/ui/json-ld";
import { SidebarLayout } from "@/components/ui/page-shell";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  type Area,
  getAncestors,
  getAreaBreadcrumbs,
  getAreaWithSubtreeSize,
  getClimbSendStats,
  getSubareas,
  getSubtreeClimbs,
  getSubtreeGradeHistogram,
  getUserSentClimbIds,
  resolveSubareaScope,
} from "@/db/queries";
import { getPublicArea, getPublicAncestors } from "@/db/queries/public-catalog";
import {
  parseAreaClimbsFilter,
  parseAreaClimbsSort,
  toSubtreeQueryFilter,
} from "@/lib/filters/area-climbs-filter";
import { buildGradeHistogram } from "@/lib/grade-histogram";
import { areaDescription, areaJsonLd, areaTitle, locationTrail, pageMetadata } from "@/lib/seo";
import { getMemberSession as getSession } from "@/lib/session";
import { areaHref, slugify, withQuery } from "@/lib/slug";
import type { UrlParamsRecord } from "@/lib/url-params";

import { PublicAreaPage } from "./public-area-page";

type AreaPageProps = {
  // Optional catch-all: `slug` is undefined for /areas/:id and a segment
  // array otherwise. The id is authoritative; the redirect normalizes the
  // slug (query string preserved).
  params: Promise<{ id: string; slug?: string[] }>;
  searchParams: Promise<UrlParamsRecord>;
};

// generateMetadata and the page both need the area. The query helpers are
// plain async functions keyed on a per-call db handle, so memoizing them
// directly would never hit — memoize the whole id -> area lookup with React
// cache() instead, so the two consumers share one query per request.
const getAreaById = cache(async (id: number) => {
  const db = await getDb();
  return getAreaWithSubtreeSize(db, id);
});

// Same memoization for the ancestor chain, keyed on the area row so
// generateMetadata (title, description, breadcrumb JSON-LD) and the page
// walk it once between them.
const getAreaAncestors = cache(async (area: Area) => getAncestors(await getDb(), area));

export async function generateMetadata({ params, searchParams }: AreaPageProps): Promise<Metadata> {
  const [{ id, slug }, search] = await Promise.all([params, searchParams]);
  const areaId = Number(id);
  if (!Number.isInteger(areaId)) notFound();

  const area = await getPublicArea(await getDb(), areaId);
  if (!area) notFound();

  // Normalize any other spelling of the URL to the canonical id + slug,
  // keeping the query string so a shared "?grade=..." link still lands
  // filtered. Done in generateMetadata so it runs before the page's data
  // fetches. On this streamed Workers deployment this is a
  // `<meta http-equiv="refresh" content="0;url=...">`, which Google treats
  // as a permanent redirect (and rel=canonical agrees); see the climb page
  // for why a real 308 would need middleware.
  if ((slug?.join("/") ?? "") !== slugify(area.name)) {
    permanentRedirect(withQuery(areaHref(area.id, area.name), search));
  }

  const ancestors = await getPublicAncestors(await getDb(), area);

  const trail = locationTrail(ancestors.map((a) => a.name));
  return pageMetadata({
    title: areaTitle(area.name, ancestors.at(-1)?.name ?? null),
    description: areaDescription(area.name, trail, area.description),
    path: areaHref(area.id, area.name),
  });
}

export default async function AreaPage({ params, searchParams }: AreaPageProps) {
  const [{ id, slug }, search] = await Promise.all([params, searchParams]);
  const areaId = Number(id);

  if (!Number.isInteger(areaId)) notFound();

  // Grouped by dependency tier so independent fetches overlap instead of
  // waterfalling — the area row and the session don't depend on each other.
  const db = await getDb();
  const session = await getSession();
  if (!session) {
    const area = await getPublicArea(db, areaId);
    if (!area) notFound();
    if ((slug?.join("/") ?? "") !== slugify(area.name))
      permanentRedirect(withQuery(areaHref(area.id, area.name), search));
    return <PublicAreaPage area={area} search={search} />;
  }
  const area = await getAreaById(areaId);
  if (!area) notFound();

  if ((slug?.join("/") ?? "") !== slugify(area.name)) {
    permanentRedirect(withQuery(areaHref(area.id, area.name), search));
  }

  const sort = parseAreaClimbsSort(search);
  const filter = parseAreaClimbsFilter(search);

  // Only the first page is server-rendered — AreaClimbsSection fetches
  // subsequent pages itself via "load more" (see app/api/areas/[id]/climbs).
  // The histogram reads every climb row in the subtree, so it follows the
  // same size gate as the list's index strategy — a continent-scale area
  // renders its header without the strip/chart instead of scanning tens of
  // thousands of rows per view.
  const histogramEligible = !area.largeSubtree;

  // The sub-area rail can scope the list to one sub-area's subtree; the
  // header, histogram, and rail always describe the whole area.
  const listScope = await resolveSubareaScope(db, area, filter.subareaId);

  const [ancestors, subareas, subtreeClimbs, histogramRows] = await Promise.all([
    getAreaAncestors(area),
    getSubareas(db, area.id),
    getSubtreeClimbs(db, listScope, 1, sort, toSubtreeQueryFilter(filter)),
    histogramEligible ? getSubtreeGradeHistogram(db, area) : [],
  ]);
  const histogram = buildGradeHistogram(histogramRows);

  const areaPath = areaHref(area.id, area.name);
  const ancestorNames = ancestors.map((a) => a.name);
  const areaCrumbs = [
    { name: "Home", path: "/" },
    ...ancestors.map((a) => ({ name: a.name, path: areaHref(a.id, a.name) })),
    { name: area.name, path: areaPath },
  ];

  const [sendStats, areaBreadcrumbs, sentClimbIds] = await Promise.all([
    getClimbSendStats(
      db,
      subtreeClimbs.climbs.map((c) => c.id),
    ),
    getAreaBreadcrumbs(
      db,
      subtreeClimbs.climbs.map((c) => c.areaId),
    ),
    getUserSentClimbIds(
      db,
      session.user.id,
      subtreeClimbs.climbs.map((climb) => climb.id),
    ),
  ]);

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
      {/* Lets ⌘K lead with this area's own routes while the viewer is here. */}
      <RegisterSearchScope areaId={area.id} areaName={area.name} />
      <AreaBreadcrumbs ancestors={ancestors} current={area} />

      <AreaCragHeader
        area={area}
        areaPath={areaPath}
        histogram={histogram}
        filter={filter}
        actions={<AreaHeaderActions area={area} />}
      />

      {/* The provider links the toolbar's in-flight navigation to the climb
       * list it re-fetches, which dims while pending. */}
      <NavigationPendingProvider>
        {(() => {
          const climbsBlock = (
            <div className="flex flex-col gap-3">
              <SectionHeading>Climbs</SectionHeading>
              <AreaClimbsToolbar areaPath={areaPath} sort={sort} filter={filter} />
              <AreaClimbsSection
                // Remounts with fresh initial* state on a sort/filter change,
                // rather than syncing local "load more" state to changed props
                // via an effect — same reasoning as UserSendList.
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
            </div>
          );

          if (subareas.length === 0) return climbsBlock;

          return (
            <SidebarLayout
              sidebarWidthClass="lg:w-64"
              sidebar={
                /* Gated on lg to match where the rail becomes a side column;
                 * on mobile it's a collapsed accordion above the list. */
                <CollapsibleSection title="Sub-areas" breakpoint="lg">
                  <SubareaRail subareas={subareas.map(({ id, name }) => ({ id, name }))} />
                </CollapsibleSection>
              }
            >
              {climbsBlock}
            </SidebarLayout>
          );
        })()}
      </NavigationPendingProvider>
    </div>
  );
}
