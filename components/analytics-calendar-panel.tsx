"use client";

import { Button, Menu } from "@heroui/react";
import { ChevronDown, Layers3 } from "lucide-react";
import { useState } from "react";
import { MenuTrigger, Popover, type Selection } from "react-aria-components";

import { AnalyticsCalendar } from "@/components/analytics-calendar";
import { DISCIPLINE_HUE, DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { AnalyticsSendRow } from "@/db/queries";
import { calendarCountsForDisciplines } from "@/lib/calendar-activity";
import { sendChartRows, sessionChartRows, type ChartSession } from "@/lib/chart-details";
import type { ClimbType } from "@/lib/grades";
import { DISCIPLINE_ORDER, inSelectedYears } from "@/lib/user-analytics";

const ALL = "all";

function CalendarDisciplineFilter({
  available,
  selected,
  onChange,
}: {
  available: ClimbType[];
  selected: ClimbType[];
  onChange: (types: ClimbType[]) => void;
}) {
  const label = selected.length
    ? selected.map((type) => DISCIPLINE_LABELS[type]).join(" + ")
    : "All disciplines";
  return (
    <MenuTrigger>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Calendar disciplines: ${label}`}
        className="h-9 max-w-44 min-w-0 gap-1.5"
      >
        <Layers3 aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0" />
      </Button>
      <Popover className="popover" placement="bottom end">
        <Menu.Root
          aria-label="Calendar disciplines"
          selectionMode="multiple"
          shouldCloseOnSelect={false}
          selectedKeys={selected.length ? selected : [ALL]}
          onSelectionChange={(keys: Selection) => {
            const next = keys === "all" ? [] : [...keys].map(String);
            if (next.includes(ALL) && selected.length > 0) return onChange([]);
            const chosen = DISCIPLINE_ORDER.filter((type) => next.includes(type));
            onChange(chosen.length === available.length ? [] : chosen);
          }}
        >
          <Menu.Item id={ALL} textValue="All disciplines">
            All disciplines
            <Menu.ItemIndicator />
          </Menu.Item>
          {available.map((type) => (
            <Menu.Item key={type} id={type} textValue={DISCIPLINE_LABELS[type]}>
              {DISCIPLINE_LABELS[type]}
              <Menu.ItemIndicator />
            </Menu.Item>
          ))}
        </Menu.Root>
      </Popover>
    </MenuTrigger>
  );
}

/** Calendar-only discipline selection. The page's discipline still governs
 * grade charts; this panel can show any union of climbing days. */
export function AnalyticsCalendarPanel({
  sends,
  sessions,
  selectedYears,
  journalVisible,
}: {
  sends: AnalyticsSendRow[];
  sessions: ChartSession[];
  selectedYears: number[];
  journalVisible: boolean;
}) {
  // Empty follows the app's filter convention: all available disciplines.
  const [selected, setSelected] = useState<ClimbType[]>([]);
  const available = DISCIPLINE_ORDER.filter((type) =>
    journalVisible
      ? sessions.some(
          (session) =>
            session.climbType === type && inSelectedYears(session.entryDate, selectedYears),
        )
      : sends.some(
          (send) =>
            send.climbType === type &&
            send.dateSent != null &&
            inSelectedYears(send.dateSent, selectedYears),
        ),
  );
  const effectiveSelected = selected.filter((type) => available.includes(type));
  const normalizedSelected = effectiveSelected.length === available.length ? [] : effectiveSelected;
  const types = normalizedSelected.length ? normalizedSelected : available;
  const countsByDay = calendarCountsForDisciplines(
    sends,
    journalVisible ? sessions : undefined,
    types,
  );
  const years = selectedYears.length
    ? [...selectedYears].sort((a, b) => a - b)
    : [...new Set(Object.keys(countsByDay).map((day) => Number(day.slice(0, 4))))].sort(
        (a, b) => a - b,
      );
  const activities = journalVisible
    ? sessionChartRows(
        sessions.filter(
          (entry) =>
            types.includes(entry.climbType) && inSelectedYears(entry.entryDate, selectedYears),
        ),
        sends,
      )
    : sendChartRows(
        sends.filter(
          (send) => types.includes(send.climbType) && inSelectedYears(send.dateSent, selectedYears),
        ),
      );
  const title = journalVisible ? "Outdoor calendar" : "Sending calendar";
  const unit = journalVisible ? "session" : "send";
  const description =
    available.length === 1
      ? `${DISCIPLINE_LABELS[available[0]]} ${unit}s per day.`
      : `${journalVisible ? "Sessions" : "Sends"} per day across selected disciplines.`;

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Eyebrow>{title}</Eyebrow>
          <p className="text-xs text-muted">{description}</p>
        </div>
        {available.length > 1 && (
          <CalendarDisciplineFilter
            available={available}
            selected={normalizedSelected}
            onChange={setSelected}
          />
        )}
      </div>
      {years.length ? (
        <AnalyticsCalendar
          key={years.join(",")}
          years={years}
          countsByDay={countsByDay}
          activities={activities}
          hue={types.length === 1 ? DISCIPLINE_HUE[types[0]] : "#ef846c"}
          unit={unit}
        />
      ) : (
        <p className="text-sm text-muted">
          {journalVisible ? "No logged sessions" : "No dated sends"} for these disciplines.
        </p>
      )}
    </div>
  );
}
