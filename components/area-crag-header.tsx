import type { ReactNode } from "react";

import { AreaDescription } from "@/components/area-description";
import { GradeHistogramChart } from "@/components/grade-histogram";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import type { Area } from "@/db/queries";
import type { AreaClimbsFilter } from "@/lib/filters/area-climbs-filter";
import { formatCount } from "@/lib/format";
import type { GradeHistogram } from "@/lib/grade-histogram";

/** The guidebook crag header: entity eyebrow, display-face name,
 * description, then `children` — the page passes AreaGradeSpread there —
 * everything a climber skims before deciding to scroll the route table. */
export function AreaCragHeader({
  area,
  actions,
  children,
}: {
  area: Area;
  /** The area's editor actions, rendered beside the title. */
  actions: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Stacked until sm: the actions can't share a phone's width with the
       * title. min-w-0 lets the title column shrink. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Eyebrow>Area</Eyebrow>
          <PageTitle>{area.name}</PageTitle>
          <AreaDescription area={area} />
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

/** Mirrors AreaGradeSpread: the info strip, then the histogram, which
 * collapses to a trigger row below md. */
export function AreaGradeSpreadLoading() {
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

/** A mono info strip (climb count, grade spans, disciplines) and the
 * grade-spread histogram. */
export function AreaGradeSpread({
  histogram,
  areaPath,
  filter,
}: {
  histogram: GradeHistogram;
  /** Canonical id + slug URL for this area — the histogram bars filter
   * through it so a click doesn't bounce off a redirect. */
  areaPath: string;
  /** The page's active climb filter — lets an applied histogram bucket
   * render selected and toggle clear on click. */
  filter?: AreaClimbsFilter;
}) {
  const spans: string[] = [];
  if (histogram.boulderSpan) spans.push(`${histogram.boulderSpan[0]}–${histogram.boulderSpan[1]}`);
  if (histogram.ropeSpan) spans.push(`${histogram.ropeSpan[0]}–${histogram.ropeSpan[1]}`);

  return (
    <>
      {histogram.totalClimbs > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span className="text-foreground">{formatCount(histogram.totalClimbs, "climb")}</span>
          {spans.map((span) => (
            <span key={span}>{span}</span>
          ))}
          {histogram.ungradedCount > 0 && (
            <span>{formatCount(histogram.ungradedCount, "ungraded climb")}</span>
          )}
          <span className="flex items-center gap-1.5">
            {histogram.disciplines.map((d) => (
              <DisciplineChip key={d} type={d} />
            ))}
          </span>
        </div>
      )}

      {/* Collapsed below md so the climb list stays on the first screen; the
       * bars are a filter, so they stay reachable. Guarded because an area
       * with no groups would still get an empty trigger row. */}
      {histogram.groups.length > 0 && (
        <CollapsibleSection title="Grade spread" breakpoint="md" showTitleOnDesktop={false}>
          <GradeHistogramChart histogram={histogram} areaPath={areaPath} filter={filter} />
        </CollapsibleSection>
      )}
    </>
  );
}
