import { clsx } from "clsx";

import { AppLink } from "@/components/ui/app-link";
import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  areaClimbsFilterToSearchParams,
  DEFAULT_AREA_CLIMBS_FILTER,
  DEFAULT_AREA_CLIMBS_SORT,
  type AreaClimbsFilter,
} from "@/lib/filters/area-climbs-filter";
import { formatCount } from "@/lib/format";
import type { GradeHistogram, DisciplineHistogram, GradeBucket } from "@/lib/grade-histogram";
import type { ClimbType } from "@/lib/grades";

// Same discipline → palette hue mapping as the discipline chips.
const BAR_COLOR: Record<ClimbType, string> = {
  boulder: "bg-palette-accent",
  sport: "bg-palette-support",
  trad: "bg-palette-primary",
};

const GROUP_LABELS: Record<ClimbType, string> = {
  boulder: "Boulders",
  sport: "Sport",
  trad: "Trad",
};

/** Tallest bar in px — px (not %) so the hover-revealed count label can sit
 * in the same bottom-aligned column and hug its bar's top. */
const BAR_MAX_PX = 56;

function barHeight(count: number, max: number): number {
  // Non-zero buckets always get a visible sliver, however tall the max is.
  return Math.max(4, Math.round((count / max) * BAR_MAX_PX));
}

/** The canonical query for filtering the climb list to exactly this
 * bucket: its discipline checked, its grade span selected, everything else
 * at the defaults. Also the identity used to detect that the bucket's
 * filter is already applied (sort pinned so it cancels out). */
function bucketFilterQuery(type: ClimbType, bucket: GradeBucket): string {
  const filter = { ...DEFAULT_AREA_CLIMBS_FILTER, disciplines: [type] };
  if (type === "boulder") filter.boulderRange = bucket.range;
  else if (type === "sport") filter.sportRange = bucket.range;
  else filter.tradRange = bucket.range;
  return areaClimbsFilterToSearchParams(DEFAULT_AREA_CLIMBS_SORT, filter).toString();
}

function BucketColumn({
  count,
  label,
  active = false,
  children,
}: {
  count: number;
  label: string;
  /** This bucket's filter is currently applied — its count stays visible
   * and its axis label reads selected. */
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex h-20 w-full flex-col items-center justify-end gap-0.5">
        {count > 0 && (
          <span
            aria-hidden
            className={clsx(
              "text-[10px] leading-none tabular-nums transition-opacity",
              active
                ? "text-foreground opacity-100"
                : "text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          >
            {count}
          </span>
        )}
        {children}
      </div>
      {/* Every bar wears its grade; the label is also the hover cue — it
       * lifts and darkens under the cursor so the bar reads as clickable.
       * Empty spacer buckets stay unlabeled (the bars carry the axis). */}
      <span
        aria-hidden
        className={clsx(
          "h-3 text-[10px] leading-none transition-all duration-150",
          active
            ? "font-medium text-foreground underline underline-offset-2"
            : "text-muted group-hover:-translate-y-0.5 group-hover:font-medium group-hover:text-foreground group-focus-visible:-translate-y-0.5 group-focus-visible:font-medium group-focus-visible:text-foreground",
        )}
      >
        {count > 0 ? label : null}
      </span>
    </>
  );
}

function DisciplineChart({
  areaPath,
  group,
  delayBase,
  currentFilterQuery,
}: {
  areaPath: string;
  group: DisciplineHistogram;
  delayBase: number;
  /** Canonical serialization of the page's active filter (sort pinned) —
   * a bucket whose own query matches is "applied", and its link clears. */
  currentFilterQuery: string;
}) {
  const max = Math.max(...group.buckets.map((b) => b.count), 1);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <Eyebrow>{GROUP_LABELS[group.type]}</Eyebrow>
      <div className="flex items-end gap-[3px]">
        {group.buckets.map((bucket, i) => {
          const query = bucketFilterQuery(group.type, bucket);
          const active = query === currentFilterQuery;

          const bar = bucket.count > 0 && (
            <div
              aria-hidden
              className={clsx(
                "w-full rounded-t-xs motion-safe:animate-bar-grow",
                BAR_COLOR[group.type],
              )}
              style={{
                height: `${barHeight(bucket.count, max)}px`,
                animationDelay: `${(delayBase + i) * 15}ms`,
              }}
              title={
                active
                  ? `${bucket.label}: ${bucket.count} (click to clear)`
                  : `${bucket.label}: ${bucket.count}`
              }
            />
          );

          // A voted bucket is a link that filters the climb list below to
          // exactly this discipline + grade span — or, when that filter is
          // already applied, clears it. Empty buckets are inert spacers
          // that keep the axis contiguous.
          return bucket.count > 0 ? (
            <AppLink
              key={bucket.label}
              href={active ? areaPath : `${areaPath}?${query}`}
              aria-label={
                active
                  ? `Clear the ${bucket.label} ${DISCIPLINE_LABELS[group.type]} filter`
                  : `Show ${formatCount(bucket.count, `${DISCIPLINE_LABELS[group.type]} climb`)} at ${bucket.label}`
              }
              className="group flex min-w-0 flex-1 flex-col items-center gap-1 no-underline"
            >
              <BucketColumn count={bucket.count} label={bucket.label} active={active}>
                {bar}
              </BucketColumn>
            </AppLink>
          ) : (
            <div
              key={bucket.label}
              aria-hidden
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <BucketColumn count={0} label={bucket.label} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The crag header's signature: the subtree's grade spread as one CSS-bar
 * chart per discipline, colored by the discipline palette. Every bar is a
 * link that applies the matching discipline + grade filter to the climb
 * list; exact counts reveal on hover/focus and via each link's label.
 * Server-rendered; no chart library. */
export function GradeHistogramChart({
  histogram,
  areaPath,
  filter = DEFAULT_AREA_CLIMBS_FILTER,
}: {
  histogram: GradeHistogram;
  areaPath: string;
  /** The page's currently applied climb filter, so an already-applied
   * bucket renders selected and its click clears the filter. */
  filter?: AreaClimbsFilter;
}) {
  if (histogram.groups.length === 0) return null;

  const currentFilterQuery = areaClimbsFilterToSearchParams(
    DEFAULT_AREA_CLIMBS_SORT,
    filter,
  ).toString();

  // Stagger continues across groups: each group's delay base is the number
  // of bars before it (prefix sum, computed without render-time mutation).
  const delayBases = histogram.groups.map((_, i) =>
    histogram.groups.slice(0, i).reduce((sum, g) => sum + g.buckets.length, 0),
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
      {histogram.groups.map((group, i) => (
        <DisciplineChart
          key={group.type}
          areaPath={areaPath}
          group={group}
          delayBase={delayBases[i]}
          currentFilterQuery={currentFilterQuery}
        />
      ))}
    </div>
  );
}
