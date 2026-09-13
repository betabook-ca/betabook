import { AuthCallout } from "@/components/auth-callout";
import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { AreaClimbsToolbar } from "@/components/filters/area-climbs-toolbar";
import { PublicClimbList } from "@/components/public-climb-list";
import { RegisterSearchScope } from "@/components/search-scope";
import { SubareaRail } from "@/components/subarea-rail";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { JsonLd } from "@/components/ui/json-ld";
import { SidebarLayout } from "@/components/ui/page-shell";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getPublicAncestors,
  getPublicSubareas,
  resolvePublicSubarea,
  searchPublicClimbs,
} from "@/db/queries/public-catalog";
import { missingDescriptionMessage } from "@/lib/descriptions";
import {
  areaClimbsFilterToSearchParams,
  parseAreaClimbsFilter,
  parseAreaClimbsSort,
} from "@/lib/filters/area-climbs-filter";
import { publicCatalogOptions, type PublicAreaDetails } from "@/lib/public-catalog";
import { areaDescription, areaJsonLd, locationTrail } from "@/lib/seo";
import { areaHref, withQuery } from "@/lib/slug";
import type { UrlParamsRecord } from "@/lib/url-params";

export async function PublicAreaPage({
  area,
  search,
}: {
  area: PublicAreaDetails;
  search: UrlParamsRecord;
}) {
  const db = await getDb();
  const path = areaHref(area.id, area.name);
  const sort = parseAreaClimbsSort(search);
  const filter = parseAreaClimbsFilter(search);
  const params = areaClimbsFilterToSearchParams(sort, filter);
  const options = publicCatalogOptions(params);
  const scope = await resolvePublicSubarea(db, area, filter.subareaId);
  const [ancestors, subareas, initial] = await Promise.all([
    getPublicAncestors(db, area),
    getPublicSubareas(db, area.id),
    searchPublicClimbs(db, { ...options, areaId: scope.id }),
  ]);
  const ancestorNames = ancestors.map((a) => a.name);
  const climbsBlock = (
    <div className="flex flex-col gap-3">
      <SectionHeading>Climbs</SectionHeading>
      <AreaClimbsToolbar areaPath={path} sort={sort} filter={filter} />
      <PublicClimbList
        key={`climbs:${params}`}
        initial={initial}
        areaId={area.id}
        query={params.toString()}
      />
    </div>
  );
  return (
    <div className="flex flex-col gap-6">
      <JsonLd
        data={areaJsonLd({
          name: area.name,
          path,
          description: areaDescription(area.name, locationTrail(ancestorNames), area.description),
          ancestorNames,
          crumbs: [
            { name: "Home", path: "/" },
            ...ancestors.map((a) => ({ name: a.name, path: areaHref(a.id, a.name) })),
            { name: area.name, path },
          ],
        })}
      />
      <RegisterSearchScope areaId={area.id} areaName={area.name} />
      <AreaBreadcrumbs ancestors={ancestors} current={area} />
      <PageTitle>{area.name}</PageTitle>
      <p className="text-muted">{area.description || missingDescriptionMessage()}</p>
      <AuthCallout
        next={withQuery(path, search)}
        description="Sign in to see who has climbed these lines and to log your own sessions."
      />
      {subareas.length ? (
        <SidebarLayout
          sidebarWidthClass="lg:w-64"
          sidebar={
            <CollapsibleSection title="Sub-areas" breakpoint="lg">
              <SubareaRail subareas={subareas} />
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
