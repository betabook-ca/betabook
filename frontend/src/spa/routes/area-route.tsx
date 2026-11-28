import { useParams, useSearchParams } from "react-router";

import {
  NavigationPendingProvider,
  NavigationPendingRegion,
} from "@/components/app-shell/navigation-pending";
import { AreaClimbsSection } from "@/components/areas/area-climbs-section";
import { AreaCragHeader, AreaGradeSpread } from "@/components/areas/area-crag-header";
import { AreaHeaderActions } from "@/components/areas/area-header-actions";
import { AreaBreadcrumbs } from "@/components/areas/breadcrumbs";
import { SubareaRail } from "@/components/areas/subarea-rail";
import { AuthCallout } from "@/components/auth/auth-callout";
import { useGradePreferences } from "@/components/climbing/grade-preferences";
import { PublicClimbList } from "@/components/climbs/public-climb-list";
import { AreaClimbsToolbar } from "@/components/filters/area-climbs-toolbar";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { InlineAlert } from "@/components/ui/inline-alert";
import { NotFoundMessage } from "@/components/ui/not-found-message";
import { SidebarLayout } from "@/components/ui/page-shell";
import { SkeletonEntityPage } from "@/components/ui/skeleton";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import type { SubtreeClimbsSort } from "@/lib/climb-list-sort";
import { missingDescriptionMessage } from "@/lib/descriptions";
import {
  type AreaClimbsFilter,
  areaClimbsFilterToSearchParams,
  parseAreaClimbsFilter,
  parseAreaClimbsSort,
} from "@/lib/filters/area-climbs-filter";
import { buildGradeHistogram } from "@/lib/grade-histogram";
import type { PublicArea, PublicAreaDetails, PublicClimbsPage } from "@/lib/public-catalog";
import { areaHref, withQuery } from "@/lib/slug";
import { searchParamsToRecord, type UrlParamsRecord } from "@/lib/url-params";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError, parsePositiveId } from "@/spa/lib/fetch-json";
import { usePathname } from "@/spa/lib/navigation";
import { usePublicEntryReady } from "@/spa/lib/public-entry";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

type AreaBootstrap = {
  areaId: number;
  area: PublicAreaDetails;
  ancestors: PublicAreaDetails[];
  subareas: PublicArea[];
  climbsPage: PublicClimbsPage;
};

type MemberAreaPayload = ApiResponse<"/api/pages/areas/{id}">;

type PublicAreaPayload = Omit<AreaBootstrap, "areaId">;

function AreaNotFoundView() {
  return (
    <NotFoundMessage heading="Area not found" message="No climbing area exists at this URL." />
  );
}

function AreaErrorBanner({ error }: { error: string }) {
  return <InlineAlert>{error}</InlineAlert>;
}

function PublicAreaView({
  areaId,
  sort,
  filter,
  canonicalQuery,
  rawQuery,
  searchRecord,
}: {
  areaId: number;
  sort: SubtreeClimbsSort;
  filter: AreaClimbsFilter;
  canonicalQuery: string;
  rawQuery: string;
  searchRecord: UrlParamsRecord;
}) {
  const pathname = usePathname();
  const pathArgs = { id: String(areaId) };
  const loadClimbs = (signal: AbortSignal) =>
    fetchApi("/api/public/areas/{id}/climbs", {
      path: pathArgs,
      query: new URLSearchParams(canonicalQuery),
      signal,
    });
  const page = useRetainedPage<PublicAreaPayload>({
    resource: "area:PublicAreaView",
    scope: String(areaId),
    query: canonicalQuery,
    initial: () => {
      const seed = peekBootstrapData("area", pathname, rawQuery) as AreaBootstrap | null;
      return seed?.areaId === areaId ? seed : null;
    },
    async load(signal) {
      const [details, climbsPage] = await Promise.all([
        fetchApi("/api/public/areas/{id}", { path: pathArgs, signal }),
        loadClimbs(signal),
      ]);
      return { ...details, climbsPage };
    },
    async refine(previous, _query, signal) {
      return { ...previous, climbsPage: await loadClimbs(signal) };
    },
  });
  const data = page.data;
  const notFound = isNotFoundError(page.error);
  const error =
    page.error instanceof Error ? page.error.message : page.error ? "Failed to load area" : null;
  usePublicEntryReady(Boolean(data || error));
  usePageTitle(
    notFound
      ? "Area not found"
      : data
        ? data.ancestors.at(-1)
          ? data.area.name + " climbing · " + data.ancestors.at(-1)?.name
          : data.area.name + " climbing"
        : null,
  );
  if (notFound) return <AreaNotFoundView />;
  if (!data && error) return <AreaErrorBanner error={error} />;
  if (!data) return <SkeletonEntityPage rows={8} />;

  const path = areaHref(data.area.id, data.area.name);
  const climbsBlock = (
    <div className="flex flex-col gap-3">
      <SectionHeading>Climbs</SectionHeading>
      <NavigationPendingProvider>
        <AreaClimbsToolbar areaPath={path} sort={sort} filter={filter} showExcludeSent={false} />
        {error ? (
          <AreaErrorBanner error={error} />
        ) : (
          <NavigationPendingRegion pending={page.pending}>
            <PublicClimbList
              key={page.query}
              initial={data.climbsPage}
              areaId={data.area.id}
              query={page.query ?? ""}
              pending={page.pending}
            />
          </NavigationPendingRegion>
        )}
      </NavigationPendingProvider>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <AreaBreadcrumbs ancestors={data.ancestors} current={data.area} />
      <PageTitle>{data.area.name}</PageTitle>
      <p className="text-muted">{data.area.description || missingDescriptionMessage()}</p>
      <AuthCallout
        next={withQuery(path, searchRecord)}
        description="Sign in to see who has climbed these lines and to log your own sessions."
      />
      {data.subareas.length > 0 ? (
        <SidebarLayout
          sidebarWidthClass="lg:w-64"
          sidebar={
            <CollapsibleSection title="Sub-areas" breakpoint="lg">
              <SubareaRail subareas={data.subareas} />
            </CollapsibleSection>
          }
        >
          {climbsBlock}
        </SidebarLayout>
      ) : (
        climbsBlock
      )}
    </div>
  );
}

function MemberAreaView({
  areaId,
  viewerId,
  sort,
  filter,
  canonicalQuery,
}: {
  areaId: number;
  viewerId: string;
  sort: SubtreeClimbsSort;
  filter: AreaClimbsFilter;
  canonicalQuery: string;
}) {
  const prefs = useGradePreferences();
  const options = (signal: AbortSignal) => ({
    path: { id: String(areaId) },
    query: new URLSearchParams(canonicalQuery),
    signal,
    sessionEvents: true,
  });
  const page = useRetainedPage<MemberAreaPayload>({
    resource: "area:MemberAreaView",
    scope: JSON.stringify([viewerId, areaId]),
    query: canonicalQuery,
    load: (signal) => fetchApi("/api/pages/areas/{id}", options(signal)),
    async refine(previous, _query, signal) {
      return { ...previous, climbsPage: await fetchApi("/api/areas/{id}/climbs", options(signal)) };
    },
  });
  const data = page.data;
  const notFound = isNotFoundError(page.error);
  const error =
    page.error instanceof Error ? page.error.message : page.error ? "Failed to load area" : null;
  usePublicEntryReady(Boolean(data || error));
  usePageTitle(
    notFound
      ? "Area not found"
      : data
        ? data.ancestors.at(-1)
          ? data.area.name + " climbing · " + data.ancestors.at(-1)?.name
          : data.area.name + " climbing"
        : null,
  );
  if (notFound) return <AreaNotFoundView />;
  if (!data && error) return <AreaErrorBanner error={error} />;
  if (!data) return <SkeletonEntityPage rows={8} />;

  const committed = searchParamsToRecord(new URLSearchParams(page.query));
  const areaPath = areaHref(data.area.id, data.area.name);
  const climbsBlock = (
    <div className="flex flex-col gap-3">
      <SectionHeading>Climbs</SectionHeading>
      <AreaClimbsToolbar areaPath={areaPath} sort={sort} filter={filter} showExcludeSent />
      {error ? (
        <AreaErrorBanner error={error} />
      ) : (
        <AreaClimbsSection
          key={page.query}
          areaId={data.area.id}
          sort={parseAreaClimbsSort(committed)}
          filter={parseAreaClimbsFilter(committed)}
          pending={page.pending}
          initialClimbs={data.climbsPage.climbs}
          initialHasNextPage={data.climbsPage.hasNextPage}
          initialSendStats={data.climbsPage.sendStats}
          initialAreaBreadcrumbs={data.climbsPage.areaBreadcrumbs}
          sentClimbIds={new Set(data.climbsPage.sentClimbIds)}
          emptyMessage={
            filter.subareaId != null
              ? "No climbs match in this sub-area."
              : "No climbs found in this area or its sub-areas."
          }
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <AreaBreadcrumbs ancestors={data.ancestors} current={data.area} />
      <AreaCragHeader area={data.area} actions={<AreaHeaderActions area={data.area} />}>
        {!data.area.largeSubtree && (
          <AreaGradeSpread
            histogram={buildGradeHistogram(data.gradeHistogramRows, prefs)}
            areaPath={areaPath}
            filter={filter}
          />
        )}
      </AreaCragHeader>

      <NavigationPendingProvider>
        {data.subareas.length === 0 ? (
          climbsBlock
        ) : (
          <SidebarLayout
            sidebarWidthClass="lg:w-64"
            sidebar={
              <CollapsibleSection title="Sub-areas" breakpoint="lg">
                <SubareaRail subareas={data.subareas.map(({ id, name }) => ({ id, name }))} />
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

export default function AreaRoute({ viewerId }: { viewerId: string | null }) {
  const params = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const areaId = parsePositiveId(params.id);

  if (areaId === null) {
    return <AreaNotFoundView />;
  }

  const searchRecord = searchParamsToRecord(searchParams);
  const sort = parseAreaClimbsSort(searchRecord);
  const filter = parseAreaClimbsFilter(searchRecord);
  const filterParams = areaClimbsFilterToSearchParams(sort, filter);
  if (filter.excludeSent && !viewerId) {
    filterParams.delete("excludeSent");
  }
  const canonicalQuery = filterParams.toString();

  if (viewerId !== null) {
    return (
      <MemberAreaView
        viewerId={viewerId}
        areaId={areaId}
        sort={sort}
        filter={filter}
        canonicalQuery={canonicalQuery}
      />
    );
  }

  // Native More climbs links can open a later window before the SPA starts.
  // Keep its query for refetches, Back/Forward, and subsequent Load more calls.
  for (const key of ["offset", "page", "limit"]) {
    const value = searchParams.get(key);
    if (value !== null) filterParams.set(key, value);
  }
  return (
    <PublicAreaView
      areaId={areaId}
      sort={sort}
      filter={filter}
      canonicalQuery={filterParams.toString()}
      rawQuery={searchParams.toString()}
      searchRecord={searchRecord}
    />
  );
}
