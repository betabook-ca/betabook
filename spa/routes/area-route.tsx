import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { AreaClimbsSection } from "@/components/area-climbs-section";
import { AreaCragHeader, AreaGradeSpread } from "@/components/area-crag-header";
import { AreaHeaderActions } from "@/components/area-header-actions";
import { AuthCallout } from "@/components/auth-callout";
import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { AreaClimbsToolbar } from "@/components/filters/area-climbs-toolbar";
import { NavigationPendingProvider } from "@/components/navigation-pending";
import { PublicClimbList } from "@/components/public-climb-list";
import { SubareaRail } from "@/components/subarea-rail";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useGradePreferences } from "@/components/ui/grade-preferences";
import { SidebarLayout } from "@/components/ui/page-shell";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import type {
  Area,
  AreaBreadcrumbs as AreaBreadcrumbsMap,
  ClimbSendStats,
  ClimbWithAreaName,
  GradeHistogramRow,
  SubtreeClimbsSort,
} from "@/db/queries";
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
import { fetchJson, isNotFoundError, parsePositiveId } from "@/spa/lib/fetch-json";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";
import { usePathname } from "@/spa/shims/next-navigation";

type AreaBootstrap = {
  areaId: number;
  area: PublicAreaDetails;
  ancestors: PublicAreaDetails[];
  subareas: PublicArea[];
  climbsPage: PublicClimbsPage;
};

type MemberAreaPayload = {
  areaId: number;
  query: string;
  area: Area & { largeSubtree: boolean };
  ancestors: PublicAreaDetails[];
  subareas: PublicArea[];
  gradeHistogramRows: GradeHistogramRow[];
  climbsPage: {
    climbs: ClimbWithAreaName[];
    hasNextPage: boolean;
    sendStats: Record<number, ClimbSendStats>;
    areaBreadcrumbs: AreaBreadcrumbsMap;
    sentClimbIds: number[];
  };
};

type PublicAreaPayload = {
  areaId: number;
  query: string;
  area: PublicAreaDetails;
  ancestors: PublicAreaDetails[];
  subareas: PublicArea[];
  climbsPage: PublicClimbsPage;
};

function AreaLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-9 w-72" />
      <SkeletonListRows rows={8} />
    </div>
  );
}

function AreaNotFoundView() {
  return (
    <div className="py-8 text-center">
      <PageTitle>Area not found</PageTitle>
      <p className="mt-2 text-sm text-muted">No climbing area exists at this URL.</p>
    </div>
  );
}

function AreaErrorBanner({ error }: { error: string }) {
  return (
    <div role="alert" className="rounded-lg border border-border bg-surface p-6 text-danger">
      {error}
    </div>
  );
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
  const [data, setData] = useState<PublicAreaPayload | null>(() => {
    const bootstrapped = peekBootstrapData("area", pathname, rawQuery) as AreaBootstrap | null;
    return bootstrapped && bootstrapped.areaId === areaId
      ? { ...bootstrapped, query: canonicalQuery }
      : null;
  });
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = data !== null && data.areaId === areaId && data.query === canonicalQuery;

  useEffect(() => {
    if (matches) {
      return;
    }
    const subareaSuffix =
      filter.subareaId !== null ? `&subarea=${encodeURIComponent(filter.subareaId)}` : "";
    let cancelled = false;

    async function loadPublic() {
      try {
        const [details, climbsPage] = await Promise.all([
          fetchJson<{
            area: PublicAreaDetails;
            ancestors: PublicAreaDetails[];
            subareas: PublicArea[];
          }>(`/api/public/areas/${areaId}`),
          fetchJson<PublicClimbsPage>(
            `/api/public/areas/${areaId}/climbs?${canonicalQuery}${subareaSuffix}`,
          ),
        ]);
        if (!cancelled) {
          setError(null);
          setNotFound(false);
          setData({ areaId, query: canonicalQuery, ...details, climbsPage });
        }
      } catch (err) {
        if (!cancelled) {
          if (isNotFoundError(err)) {
            setNotFound(true);
            setError(null);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load area");
          }
        }
      }
    }
    void loadPublic();
    return () => {
      cancelled = true;
    };
  }, [areaId, canonicalQuery, filter.subareaId, matches]);

  if (notFound) return <AreaNotFoundView />;
  if (error) return <AreaErrorBanner error={error} />;
  if (!matches || !data) return <AreaLoadingSkeleton />;

  const path = areaHref(data.area.id, data.area.name);
  const climbsBlock = (
    <div className="flex flex-col gap-3">
      <SectionHeading>Climbs</SectionHeading>
      <NavigationPendingProvider>
        <AreaClimbsToolbar areaPath={path} sort={sort} filter={filter} showExcludeSent={false} />
        <PublicClimbList
          key={`climbs:${canonicalQuery}`}
          initial={data.climbsPage}
          areaId={data.area.id}
          query={canonicalQuery}
        />
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
  sort,
  filter,
  canonicalQuery,
}: {
  areaId: number;
  sort: SubtreeClimbsSort;
  filter: AreaClimbsFilter;
  canonicalQuery: string;
}) {
  const refreshKey = useRouterRefreshKey();
  const prefs = useGradePreferences();
  const [data, setData] = useState<MemberAreaPayload | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = data !== null && data.areaId === areaId && data.query === canonicalQuery;

  useEffect(() => {
    const subareaSuffix =
      filter.subareaId !== null ? `&subarea=${encodeURIComponent(filter.subareaId)}` : "";
    const queryPart = canonicalQuery
      ? `?${canonicalQuery}${subareaSuffix}`
      : subareaSuffix
        ? `?${subareaSuffix.slice(1)}`
        : "";
    let cancelled = false;

    async function loadMember() {
      try {
        const payload = await fetchJson<Omit<MemberAreaPayload, "areaId" | "query">>(
          `/api/pages/areas/${areaId}${queryPart}`,
        );
        if (!cancelled) {
          setError(null);
          setNotFound(false);
          setData({ areaId, query: canonicalQuery, ...payload });
        }
      } catch (err) {
        if (!cancelled) {
          if (isNotFoundError(err)) {
            setNotFound(true);
            setError(null);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load area");
          }
        }
      }
    }
    void loadMember();
    return () => {
      cancelled = true;
    };
  }, [areaId, canonicalQuery, filter.subareaId, refreshKey]);

  if (notFound) return <AreaNotFoundView />;
  if (error) return <AreaErrorBanner error={error} />;
  if (!matches || !data) return <AreaLoadingSkeleton />;

  const areaPath = areaHref(data.area.id, data.area.name);
  const climbsBlock = (
    <div className="flex flex-col gap-3">
      <SectionHeading>Climbs</SectionHeading>
      <AreaClimbsToolbar areaPath={areaPath} sort={sort} filter={filter} showExcludeSent />
      <AreaClimbsSection
        key={`member-climbs:${canonicalQuery}`}
        areaId={data.area.id}
        sort={sort}
        filter={filter}
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
      <MemberAreaView areaId={areaId} sort={sort} filter={filter} canonicalQuery={canonicalQuery} />
    );
  }

  return (
    <PublicAreaView
      areaId={areaId}
      sort={sort}
      filter={filter}
      canonicalQuery={canonicalQuery}
      rawQuery={searchParams.toString()}
      searchRecord={searchRecord}
    />
  );
}
