"use client";
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- The named calendar region supports arrow-key year navigation. */

import { Button } from "@heroui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { ClimbingCalendar } from "@/components/climbing-calendar";
import type { ChartClimbRow } from "@/lib/chart-details";

/** One fitted calendar at a time, opening on the most recent year. */
export function AnalyticsCalendar({
  years,
  countsByDay,
  hue,
  unit,
  activities,
}: {
  years: number[];
  countsByDay: Record<string, number>;
  hue: string;
  unit: "send" | "session";
  activities?: ChartClimbRow[];
}) {
  // Years arrive oldest first, so the newest calendar is the one worth seeing first.
  const [index, setIndex] = useState(years.length - 1);
  const active = Math.min(index, years.length - 1);
  const go = (next: number) => {
    if (next < 0 || next >= years.length) return;
    setIndex(next);
  };
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-2">
        {years.length > 1 && (
          <Button
            isIconOnly
            size="sm"
            variant="outline"
            aria-label="Older calendar year"
            isDisabled={active === 0}
            onPress={() => go(active - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
        )}
        <span
          aria-label="Displayed calendar year"
          aria-live="polite"
          className="text-sm font-medium tabular-nums"
        >
          {years[active]}
        </span>
        {years.length > 1 && (
          <Button
            isIconOnly
            size="sm"
            variant="outline"
            aria-label="Newer calendar year"
            isDisabled={active === years.length - 1}
            onPress={() => go(active + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        )}
      </div>
      <div
        role="region"
        aria-label="Calendar years"
        tabIndex={0}
        className="min-w-0 rounded-panel focus-visible:status-focused"
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            go(active + (event.key === "ArrowLeft" ? -1 : 1));
          }
        }}
      >
        {years.length > 0 && (
          <section
            key={years[active]}
            aria-label={`Calendar ${years[active]}`}
            className="relative w-full min-w-0 pb-2"
          >
            <ClimbingCalendar
              countsByDay={countsByDay}
              year={years[active]}
              hue={hue}
              unit={unit}
              activities={activities}
            />
          </section>
        )}
      </div>
    </div>
  );
}
