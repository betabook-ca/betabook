import type { ReactNode } from "react";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export type GroupedDateDisplay = "day" | "continued" | "grouped";

/** Consecutive days share a date gutter within each month. Keep the server's order. */
export function DatedLogbookRows<T>({
  items,
  itemKey,
  dateOf,
  renderRow,
  pending,
}: {
  items: T[];
  itemKey: (item: T) => number;
  dateOf: (item: T) => string | null;
  renderRow: (item: T, dateDisplay: GroupedDateDisplay) => ReactNode;
  pending?: boolean;
}) {
  const dates = items.map(dateOf);
  return (
    <ul role="list" inert={pending} className="flex flex-col">
      {items.map((item, index) => {
        const date = dates[index],
          month = date?.slice(0, 7);
        const startsMonth = index === 0 || month !== dates[index - 1]?.slice(0, 7);
        const continued = index > 0 && date === dates[index - 1];
        return (
          <li key={itemKey(item)}>
            {startsMonth && (
              <h3 className="sticky top-0 z-10 border-b border-foreground/50 bg-background py-2 font-display text-xl font-semibold tracking-tight">
                {month ? MONTH_FORMAT.format(new Date(month + "-01")) : "Undated"}
              </h3>
            )}
            <div
              className={
                date && dates[index + 1] === date ? undefined : "border-b border-separator"
              }
            >
              {renderRow(item, !date ? "grouped" : continued ? "continued" : "day")}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
