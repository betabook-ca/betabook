import type { ReactNode } from "react";

import { AreaDescription } from "@/components/area-description";
import { GradeHistogramChart } from "@/components/grade-histogram";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PageTitle } from "@/components/ui/typography";
import type { Area } from "@/db/queries";
import type { AreaClimbsFilter } from "@/lib/filters/area-climbs-filter";
import { formatCount } from "@/lib/format";
import type { GradeHistogram } from "@/lib/grade-histogram";

/** The guidebook crag header: entity eyebrow, display-face name,
 * description, a mono info strip (climb count, grade spans, disciplines),
 * and the grade-spread histogram — everything a climber skims before
 * deciding to scroll the route table. */
export function AreaCragHeader({
  area,
  areaPath,
  histogram,
  actions,
  filter,
}: {
  area: Area;
  /** Canonical id + slug URL for this area — the histogram bars filter
   * through it so a click doesn't bounce off a redirect. */
  areaPath: string;
  histogram: GradeHistogram;
  /** The area's editor actions, rendered beside the title. */
  actions: ReactNode;
  /** The page's active climb filter — lets an applied histogram bucket
   * render selected and toggle clear on click. */
  filter?: AreaClimbsFilter;
}) {
  const spans: string[] = [];
  if (histogram.boulderSpan) spans.push(`${histogram.boulderSpan[0]}–${histogram.boulderSpan[1]}`);
  if (histogram.ropeSpan) spans.push(`${histogram.ropeSpan[0]}–${histogram.ropeSpan[1]}`);

  return (
    <div className="flex flex-col gap-4">
      {/* Stacked until sm: two labelled buttons plus a menu can't share a
       * phone's width with the title, and side-by-side they pushed the whole
       * page wider than the viewport. min-w-0 lets the title column actually
       * shrink rather than forcing the row wide. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Eyebrow>Area</Eyebrow>
          <PageTitle>{area.name}</PageTitle>
          <AreaDescription area={area} />
        </div>
        {actions}
      </div>

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

      {/* Below md the discipline charts stack, and three of them push the
       * climb list — the reason to open an area — off the first screen.
       * Collapsed behind a trigger row costs the same one line as dropping
       * the charts outright did, but keeps them on a phone: the bars are a
       * filter, not just a picture, and that was the part a plain hide took
       * away. Same treatment as the sub-area rail (see the page's
       * CollapsibleSection), one breakpoint down — the rail tracks `lg`
       * because that's where it becomes a side column, while this is only
       * ever asking whether there's width for the charts.
       *
       * From md up the section is permanently expanded, so desktop is
       * unchanged — hence the sr-only desktop heading rather than a visible
       * one; the header has never titled the chart there.
       *
       * Guarded rather than always wrapped: the chart renders nothing when
       * there are no groups (a largeSubtree area is handed none), and a
       * bare wrapper would still claim a gap in this stack — now with a
       * trigger row opening onto nothing. */}
      {histogram.groups.length > 0 && (
        <CollapsibleSection title="Grade spread" breakpoint="md" showTitleOnDesktop={false}>
          <GradeHistogramChart histogram={histogram} areaPath={areaPath} filter={filter} />
        </CollapsibleSection>
      )}
    </div>
  );
}
