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
  const groups: { month: string | null; rows: { item: T; date: string | null }[] }[] = [];
  for (const item of items) {
    const date = dateOf(item);
    const month = date?.slice(0, 7) ?? null;
    let group = groups.at(-1);
    if (!group || group.month !== month) {
      group = { month, rows: [] };
      groups.push(group);
    }
    group.rows.push({ item, date });
  }

  return (
    <div inert={pending}>
      {groups.map(({ month, rows }) => {
        const label = month ? MONTH_FORMAT.format(new Date(month + "-01")) : "Undated";
        return (
          <div key={month ?? "undated"}>
            <h3 className="sticky top-0 z-10 border-b border-foreground/50 bg-background py-2 font-display text-xl font-semibold tracking-tight">
              {label}
            </h3>
            <ul role="list" aria-label={label} className="flex flex-col">
              {rows.map(({ item, date }, index) => (
                <li
                  key={itemKey(item)}
                  className={
                    date && rows[index + 1]?.date === date ? undefined : "border-b border-separator"
                  }
                >
                  {renderRow(
                    item,
                    !date ? "grouped" : rows[index - 1]?.date === date ? "continued" : "day",
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
