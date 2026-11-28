"use client";

import { Button, Dropdown } from "@heroui/react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import type { Selection } from "react-aria-components";

import { formatAnalyticsYears } from "@/lib/analytics-years";
import { usePathname, useRouter, useSearchParams } from "@/spa/lib/navigation";

const ALL = "all";

/** Any combination of years in a checklist; an empty selection means All years. */
export function AnalyticsYearFilter({
  years,
  selected,
  onChange,
}: {
  years: readonly number[];
  selected: readonly number[];
  onChange: (years: number[]) => void;
}) {
  const label = selected.length ? formatAnalyticsYears([...selected]) : "All years";
  return (
    <Dropdown>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Years: ${label}`}
        className="h-9 max-w-full gap-1.5"
      >
        <CalendarDays aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0" />
      </Button>
      <Dropdown.Popover placement="bottom start">
        <Dropdown.Menu
          aria-label="Years"
          selectionMode="multiple"
          shouldCloseOnSelect={false}
          selectedKeys={selected.length ? selected.map(String) : [ALL]}
          onSelectionChange={(keys: Selection) => {
            const next = keys === "all" ? [] : [...keys].map(String);
            // Choosing All years clears the others; unchecking the last year returns to All.
            if (next.includes(ALL) && selected.length > 0) return onChange([]);
            onChange(
              next
                .filter((key) => key !== ALL)
                .map(Number)
                .sort((a, b) => a - b),
            );
          }}
        >
          <Dropdown.Item id={ALL} textValue="All years">
            All years
            <Dropdown.ItemIndicator />
          </Dropdown.Item>
          {years.map((year) => (
            <Dropdown.Item key={year} id={String(year)} textValue={String(year)}>
              {year}
              <Dropdown.ItemIndicator />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

/** Keep rapid toggles responsive while the server refreshes all chart data. */
export function AnalyticsYearNavigation({
  years,
  selected,
}: {
  years: number[];
  selected: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [optimistic, setOptimistic] = useOptimistic(selected);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="sr-only">
        {pending ? "Updating charts…" : ""}
      </p>
      <div aria-busy={pending}>
        <AnalyticsYearFilter
          years={years}
          selected={optimistic}
          onChange={(next) => {
            startTransition(() => {
              setOptimistic(next);
              const query = new URLSearchParams(search);
              query.delete("period");
              if (next.length) query.set("years", next.join(","));
              else query.delete("years");
              router.push(`${pathname}?${query}`, { scroll: false });
            });
          }}
        />
      </div>
    </div>
  );
}
