"use client";

import { Checkbox } from "@heroui/react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { SectionHeading } from "@/components/ui/typography";
import { formatDate } from "@/lib/format-date";
import type { ImportDateCluster } from "@/lib/import-date-review";

export function ImportDateWarning({
  clusters,
  undatedDates,
  onChange,
  disabled = false,
}: {
  clusters: readonly ImportDateCluster[];
  undatedDates: ReadonlySet<string>;
  onChange: (dates: Set<string>) => void;
  disabled?: boolean;
}) {
  if (!clusters.length) return null;
  return (
    <section aria-label="Review repeated dates" className="flex flex-col gap-3">
      <InlineAlert status="warning">
        <SectionHeading>
          {clusters.length === 1
            ? "Many sends share the same date"
            : "Many sends share a few dates"}
        </SectionHeading>
        <p className="mt-2">
          These may be bulk import dates. Keeping them can skew your activity charts and grade
          progression. Keep dates you trust, or choose to import these sends without dates.
        </p>
      </InlineAlert>
      <ul className="flex flex-col gap-3">
        {clusters.map(({ date, count, datedCount }) => (
          <li key={date} className="flex flex-col gap-2">
            <p className="text-sm">
              <strong className="font-medium">{formatDate(date)}</strong>
              {" · "}
              {count.toLocaleString("en-US")} of {datedCount.toLocaleString("en-US")} dated sends (
              {Math.round((count * 100) / datedCount)}%)
            </p>
            <Checkbox
              isSelected={undatedDates.has(date)}
              isDisabled={disabled}
              onChange={(selected) => {
                const next = new Set(undatedDates);
                if (selected) next.add(date);
                else next.delete(date);
                onChange(next);
              }}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="text-sm">Import sends dated {formatDate(date)} without dates</span>
              </Checkbox.Content>
            </Checkbox>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Undated sends stay in your log and are excluded from activity and progression charts. Dates
        are kept unless you select an option above.
      </p>
    </section>
  );
}
