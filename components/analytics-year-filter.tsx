"use client";

import { Button, Menu } from "@heroui/react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { MenuTrigger, Popover, type Selection } from "react-aria-components";

import { formatAnalyticsYears } from "@/lib/analytics-years";

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
    <MenuTrigger>
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
      <Popover className="popover" placement="bottom start">
        <Menu.Root
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
          <Menu.Item id={ALL} textValue="All years">
            All years
            <Menu.ItemIndicator />
          </Menu.Item>
          {years.map((year) => (
            <Menu.Item key={year} id={String(year)} textValue={String(year)}>
              {year}
              <Menu.ItemIndicator />
            </Menu.Item>
          ))}
        </Menu.Root>
      </Popover>
    </MenuTrigger>
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
    <div className="flex flex-col gap-2" aria-busy={pending}>
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
      <p role="status" className="sr-only">
        {pending ? "Updating charts…" : ""}
      </p>
    </div>
  );
}
