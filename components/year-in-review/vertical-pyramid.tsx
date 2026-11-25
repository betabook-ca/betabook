import { clsx } from "clsx";
import type { CSSProperties } from "react";

import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import type { ClimbType } from "@/lib/grades";
import type { PyramidRow } from "@/lib/user-analytics";

const plural = (count: number) => `${count} send${count === 1 ? "" : "s"}`;

/**
 * One discipline's grade pyramid. From `md` up it is a column chart, easiest
 * grade on the left, with each count on hover; bars share the width, so a
 * long scale fits without scrolling. Below `md` it is a list of rows, hardest
 * grade on top, with counts printed, since phones have no hover and a long
 * scale's columns would be too thin to label. Grades holding a top-3 send are
 * drawn at full strength, and grades with no sends keep their slot so the
 * shape is honest. The figure caption reads every count to screen readers.
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
  const max = Math.max(1, ...rows.map((row) => row.count));
  const hue = DISCIPLINE_HUE[type];
  const fill = (row: PyramidRow, index: number) =>
    row.count
      ? {
          backgroundColor: hue,
          opacity: marked.includes(row.label) ? 1 : 0.55,
          animationDelay: `${index * 15}ms`,
        }
      : {};
  const summary = rows
    .filter((row) => row.count > 0)
    .map((row) => `${row.label}: ${plural(row.count)}`)
    .join(", ");

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">Send pyramid: {summary}.</figcaption>
      <PyramidColumns rows={rows.toReversed()} max={max} fill={fill} />
      <PyramidRows rows={rows} max={max} fill={fill} />
    </figure>
  );
}

type BarProps = {
  rows: PyramidRow[];
  max: number;
  fill: (row: PyramidRow, index: number) => CSSProperties;
};

/** Desktop: vertical bars, easiest on the left, counts on hover. */
function PyramidColumns({ rows, max, fill }: BarProps) {
  const columns = { gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` };
  return (
    <div aria-hidden="true" className="hidden pt-8 md:block">
      <ul className="grid h-40 items-end gap-1" style={columns}>
        {rows.map((row, index) => (
          <li key={row.label} className="group relative flex h-full flex-col justify-end">
            {row.count > 0 && (
              <span
                className={clsx(
                  "pointer-events-none absolute -top-7 z-10 rounded-md bg-overlay px-2 py-0.5 text-xs whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100",
                  // Edge bars anchor their tooltip inward, so it never
                  // reaches past the chart.
                  index < 2
                    ? "left-0"
                    : index >= rows.length - 2
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2",
                )}
              >
                {plural(row.count)}
              </span>
            )}
            <div
              className={clsx(
                "w-full rounded-t-xs motion-safe:animate-bar-grow",
                row.count === 0 && "bg-surface-tertiary",
              )}
              style={{
                height: row.count ? `${Math.max(4, (row.count / max) * 100)}%` : "3px",
                ...fill(row, index),
              }}
            />
          </li>
        ))}
      </ul>
      <div className="mt-1 grid gap-1 text-center text-[11px] text-muted" style={columns}>
        {rows.map((row) => (
          <span key={row.label} className="min-w-0 truncate">
            {row.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Phones: one row per grade, hardest on top, with the count printed. */
function PyramidRows({ rows, max, fill }: BarProps) {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-1 text-xs tabular-nums md:hidden">
      {rows.map((row, index) => (
        <li key={row.label} className="grid grid-cols-[3rem_minmax(0,1fr)_2rem] items-center gap-2">
          <span className="text-foreground">{row.label}</span>
          <div className="h-3">
            <div
              className={clsx(
                "h-full rounded-xs motion-safe:animate-bar-grow-x",
                row.count === 0 && "bg-surface-tertiary",
              )}
              style={{
                width: row.count ? `${Math.max(2, (row.count / max) * 100)}%` : "2px",
                ...fill(row, index),
              }}
            />
          </div>
          <span className="text-right text-muted">{row.count || ""}</span>
        </li>
      ))}
    </ul>
  );
}
