import { clsx } from "clsx";

const NONE: number[] = [];

/** A row of small vertical bars with labels underneath, for the month and
 * weekday strips. `null` values draw as an empty, greyed slot. Labels may
 * repeat (J, F, M, A, M…), so bars are keyed by position. */
export function BarStrip({
  values,
  labels,
  highlight = NONE,
  summary,
  valueLabels,
}: {
  values: (number | null)[];
  labels: string[];
  highlight?: number[];
  /** Read by screen readers instead of the bars. */
  summary: string;
  /** Printed above each bar instead of its number. */
  valueLabels?: (string | null)[];
}) {
  const max = Math.max(1, ...values.map((value) => value ?? 0));
  const columns = { gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` };
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">{summary}</figcaption>
      <div aria-hidden="true" className="grid h-28 items-end gap-1.5" style={columns}>
        {values.map((value, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- labels repeat; position is the identity
          <div key={index} className="flex h-full flex-col items-center justify-end gap-1">
            <span className="text-[10px] text-muted tabular-nums">
              {valueLabels ? (valueLabels[index] ?? "") : value ? String(value) : ""}
            </span>
            <div
              className={clsx(
                "w-full rounded-xs motion-safe:animate-bar-grow",
                value == null
                  ? "bg-surface-tertiary"
                  : highlight.includes(index)
                    ? "bg-accent"
                    : "bg-accent/35",
              )}
              style={{ height: value == null ? "4px" : `${Math.max(4, (value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="grid gap-1.5 text-center text-[11px] text-muted"
        style={columns}
      >
        {labels.map((label, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- labels repeat; position is the identity
          <span key={index}>{label}</span>
        ))}
      </div>
    </figure>
  );
}
