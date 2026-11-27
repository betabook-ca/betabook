import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { AreaClimbsSection } from "@/components/area-climbs-section";
import { AuthCallout } from "@/components/auth-callout";
import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { AreaClimbsToolbar } from "@/components/filters/area-climbs-toolbar";
import { NavigationPendingProvider } from "@/components/navigation-pending";
import { PublicClimbList } from "@/components/public-climb-list";
import { SubareaRail } from "@/components/subarea-rail";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SidebarLayout } from "@/components/ui/page-shell";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import type {
  AreaBreadcrumbs as AreaBreadcrumbsMap,
  ClimbSendStats,
  ClimbWithAreaName,
} from "@/db/queries";
import { missingDescriptionMessage } from "@/lib/descriptions";
import {
  areaClimbsFilterToSearchParams,
  parseAreaClimbsFilter,
  parseAreaClimbsSort,
} from "@/lib/filters/area-climbs-filter";
import type { PublicArea, PublicAreaDetails, PublicClimbsPage } from "@/lib/public-catalog";
import { areaHref, withQuery } from "@/lib/slug";
import { searchParamsToRecord } from "@/lib/url-params";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchJson, parsePositiveId, type AreaPageData } from "@/spa/lib/fetch-json";
import { usePathname } from "@/spa/shims/next-navigation";

type AreaBootstrap = {
  areaId: number;
  area: PublicAreaDetails;
  ancestors: PublicAreaDetails[];
  subareas: PublicArea[];
  climbsPage: PublicClimbsPage;
};

export default function AreaRoute({ viewerId }: { viewerId: string | null }) {
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const [searchParams] = useSearchParams();
  const areaId = parsePositiveId(params.id);

  const searchRecord = searchParamsToRecord(searchParams);
  const sort = parseAreaClimbsSort(searchRecord);
  const filter = parseAreaClimbsFilter(searchRecord);
  const filterParams = areaClimbsFilterToSearchParams(sort, filter);
  if (filter.excludeSent && !viewerId) {
    filterParams.delete("excludeSent");
  }
  const canonicalQuery = filterParams.toString();
  const rawQuery = searchParams.toString();

  const [data, setData] = useState<AreaPageData | null>(() => {
    if (areaId === null || viewerId !== null) {
      return null;
    }
    const bootstrapped = peekBootstrapData("area", pathname, rawQuery) as AreaBootstrap | null;
    if (bootstrapped && bootstrapped.areaId === areaId) {
      return {
        ...bootstrapped,
        query: canonicalQuery,
      };
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);

  const matchesActive =
    data !== null &&
    areaId !== null &&
    data.areaId === areaId &&
    data.query === canonicalQuery &&
    (viewerId === null ? data.memberClimbsPage === undefined : data.memberClimbsPage !== undefined);

  useEffect(() => {
    if (areaId === null || matchesActive) {
      return;
    }
    const targetId = areaId;
    const isMember = viewerId !== null;
    let cancelled = false;
    async function loadArea() {
      try {
        const subareaSuffix =
          filter.subareaId !== null ? `&subarea=${encodeURIComponent(filter.subareaId)}` : "";
        const climbsUrl = isMember
          ? `/api/areas/${targetId}/climbs?${canonicalQuery}${subareaSuffix}`
          : `/api/public/areas/${targetId}/climbs?${canonicalQuery}${subareaSuffix}`;

        const detailsPromise = fetchJson<{
          area: PublicAreaDetails;
          ancestors: PublicAreaDetails[];
          subareas: PublicArea[];
        }>(`/api/public/areas/${targetId}`);

        if (isMember) {
          const [details, memberPage] = await Promise.all([
            detailsPromise,
            fetchJson<{
              climbs: ClimbWithAreaName[];
              hasNextPage: boolean;
              sendStats: Record<number, ClimbSendStats>;
              areaBreadcrumbs: AreaBreadcrumbsMap;
              sentClimbIds: number[];
            }>(climbsUrl),
          ]);
          if (!cancelled) {
            setError(null);
            setData({
              areaId: targetId,
              query: canonicalQuery,
              area: details.area,
              ancestors: details.ancestors,
              subareas: details.subareas,
              climbsPage: { climbs: [], areaBreadcrumbs: {}, hasNextPage: false },
              memberClimbsPage: memberPage,
            });
          }
        } else {
          const [details, climbsPage] = await Promise.all([
            detailsPromise,
            fetchJson<PublicClimbsPage>(climbsUrl),
          ]);
          if (!cancelled) {
            setError(null);
            setData({
              areaId: targetId,
              query: canonicalQuery,
              area: details.area,
              ancestors: details.ancestors,
              subareas: details.subareas,
              climbsPage,
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load area");
        }
      }
    }
    void loadArea();
    return () => {
      cancelled = true;
    };
  }, [areaId, viewerId, canonicalQuery, filter.subareaId, matchesActive]);

  if (areaId === null) {
    return (
      <div className="py-8 text-center">
        <PageTitle>Area not found</PageTitle>
        <p className="mt-2 text-sm text-muted">No climbing area exists at this URL.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-surface p-6 text-danger">
        {error}
      </div>
    );
  }
  if (!matchesActive) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-72" />
        <SkeletonListRows rows={8} />
      </div>
    );
  }

  const path = areaHref(data.area.id, data.area.name);
  const climbsBlock = (
    <div className="flex flex-col gap-3">
      <SectionHeading>Climbs</SectionHeading>
      <NavigationPendingProvider>
        <AreaClimbsToolbar
          areaPath={path}
          sort={sort}
          filter={filter}
          showExcludeSent={Boolean(viewerId)}
        />
        {data.memberClimbsPage ? (
          <AreaClimbsSection
            key={`member-climbs:${canonicalQuery}`}
            areaId={data.area.id}
            sort={sort}
            filter={filter}
            initialClimbs={data.memberClimbsPage.climbs}
            initialHasNextPage={data.memberClimbsPage.hasNextPage}
            initialSendStats={data.memberClimbsPage.sendStats}
            initialAreaBreadcrumbs={data.memberClimbsPage.areaBreadcrumbs}
            sentClimbIds={new Set(data.memberClimbsPage.sentClimbIds)}
            emptyMessage="No climbs match in this area."
          />
        ) : (
          <PublicClimbList
            key={`climbs:${canonicalQuery}`}
            initial={data.climbsPage}
            areaId={data.area.id}
            query={canonicalQuery}
          />
        )}
      </NavigationPendingProvider>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <AreaBreadcrumbs ancestors={data.ancestors} current={data.area} />
      <PageTitle>{data.area.name}</PageTitle>
      <p className="text-muted">{data.area.description || missingDescriptionMessage()}</p>
      {!viewerId && (
        <AuthCallout
          next={withQuery(path, searchRecord)}
          description="Sign in to see who has climbed these lines and to log your own sessions."
        />
      )}
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
