import { clsx } from "clsx";

import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import type { ClimbType } from "@/lib/grades";
import type { PyramidRow } from "@/lib/user-analytics";

const plural = (count: number) => `${count} send${count === 1 ? "" : "s"}`;

/**
 * One discipline's grade pyramid as vertical bars, easiest grade on the
 * left. A bar's count shows on hover, and the figure caption reads them all
 * to screen readers. Grades holding a top-3 send are drawn at full strength. Grades with no sends keep their
 * slot so the shape is honest. Long scales scroll inside the chart rather
 * than widening the page.
 */
export function VerticalPyramid({
  type,
  rows,
  marked,
}: {
  type: ClimbType;
  /** Hardest first, as `buildPyramid` returns them. */
  rows: PyramidRow[];
  marked: string[];
}) {
  if (rows.length === 0) return null;
  const ordered = rows.toReversed();
  const max = Math.max(1, ...ordered.map((row) => row.count));
  const hue = DISCIPLINE_HUE[type];
  const summary = ordered
    .filter((row) => row.count > 0)
    .map((row) => `${row.label}: ${plural(row.count)}`)
    .join(", ");

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">Send pyramid: {summary}.</figcaption>
      <div className="overflow-x-auto pt-8">
        <ul
          className="grid h-40 items-end gap-1"
          style={{ gridTemplateColumns: `repeat(${ordered.length}, minmax(1.75rem, 1fr))` }}
        >
          {ordered.map((row, index) => (
            <li key={row.label} className="group relative flex h-full flex-col justify-end">
              {row.count > 0 && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded-md bg-overlay px-2 py-0.5 text-xs whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                >
                  {plural(row.count)}
                </span>
              )}
              <div
                role="img"
                aria-label={`${row.label}: ${plural(row.count)}`}
                className={clsx(
                  "w-full rounded-t-xs outline-offset-2 motion-safe:animate-bar-grow",
                  row.count === 0 && "bg-surface-tertiary",
                )}
                style={{
                  height: row.count ? `${Math.max(4, (row.count / max) * 100)}%` : "3px",
                  ...(row.count
                    ? {
                        backgroundColor: hue,
                        opacity: marked.includes(row.label) ? 1 : 0.55,
                        animationDelay: `${index * 15}ms`,
                      }
                    : {}),
                }}
              />
            </li>
          ))}
        </ul>
        <div
          aria-hidden="true"
          className="mt-1 grid gap-1 text-center text-[11px] text-muted"
          style={{ gridTemplateColumns: `repeat(${ordered.length}, minmax(1.75rem, 1fr))` }}
        >
          {ordered.map((row) => (
            <span key={row.label} className="truncate">
              {row.label}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
