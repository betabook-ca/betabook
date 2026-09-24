import { clsx } from "clsx";

/** The recessed track behind a row of segment pills: the page-level switch
 * between sibling views (search categories, the Add page's climb/area). */
export const SEGMENT_TRACK_CLASS =
  "flex max-w-full shrink-0 gap-1 self-start rounded-2xl bg-surface-secondary p-1";

/** One pill on a segment track; the chosen one lifts onto the segment
 * surface. Works on a button or a link. `compact` trims vertical padding for
 * short viewports while keeping a 32px target. */
export function segmentPillClass(selected: boolean, compact = false): string {
  return clsx(
    "cursor-pointer rounded-full px-3 text-sm whitespace-nowrap no-underline transition-colors hover:no-underline focus-visible:status-focused",
    compact ? "py-1.5" : "py-2",
    selected
      ? "bg-segment font-semibold text-segment-foreground"
      : "text-muted hover:text-foreground",
  );
}
