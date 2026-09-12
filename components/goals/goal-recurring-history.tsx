"use client";

import { Button, Tooltip } from "@heroui/react";
import { CircleCheckBig } from "lucide-react";
import { useState, type ReactNode } from "react";

import { DetailsDisclosure } from "@/components/ui/details-disclosure";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { apiFetch } from "@/lib/api-client";
import { goalDateLabel } from "@/lib/goal-date-label";
import { goalWeekSlots } from "@/lib/goal-week-slots";
import type { GoalPeriod, GoalProgress, GoalHistoryPage } from "@/lib/goals";

function PeriodCircle({
  period,
  start,
  end,
  today,
  monthly = false,
  unloaded = false,
}: {
  monthly?: boolean;
  unloaded?: boolean;
  period?: GoalPeriod;
  start: string;
  end: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const number = monthly ? Number(start.slice(5, 7)) : Math.ceil(Number(start.slice(8, 10)) / 7);
  const met = Boolean(period && period.progress >= period.target);
  const status = met
    ? "Met"
    : start > today
      ? "Upcoming"
      : end >= today
        ? "In progress"
        : period
          ? "Missed"
          : unloaded
            ? "Not loaded"
            : "No record";
  const inProgress = status === "In progress";
  const label = `${goalDateLabel({ repeat: monthly ? "month" : "week", timeframe: monthly ? "month" : "week", periodStart: start, periodEnd: end }, today)} · ${status}${period ? ` · ${period.progress}/${period.target}` : ""}`;
  return (
    <span className="inline-flex p-1">
      <Tooltip.Root delay={200} isOpen={open} onOpenChange={setOpen}>
        <Button
          type="button"
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={label}
          onPress={() => setOpen((value) => !value)}
          className={`relative size-7 min-w-7 overflow-visible rounded-full border p-0 text-xs font-medium tabular-nums ${met ? "border-accent bg-accent/10 text-foreground" : inProgress ? "border-2 border-accent bg-transparent text-foreground" : status === "Upcoming" ? "border-dashed border-foreground/15 bg-transparent text-muted" : "border-foreground/40 bg-transparent text-muted"}`}
        >
          {number}
          {met && (
            <span className="absolute -right-1 -bottom-1 rounded-full bg-surface-secondary">
              <CircleCheckBig aria-hidden className="size-3.5 text-success-soft-foreground" />
            </span>
          )}
        </Button>
        <Tooltip.Content placement="bottom" className="max-w-xs">
          {label}
        </Tooltip.Content>
      </Tooltip.Root>
    </span>
  );
}

function HistoryYears({
  periods,
  today,
  currentPeriod,
  hasMore,
}: {
  periods: GoalPeriod[];
  today: string;
  currentPeriod?: GoalProgress;
  hasMore: boolean;
}) {
  const records = [...periods];
  if (
    currentPeriod?.repeat === "month" &&
    !records.some((p) => p.periodStart === currentPeriod.periodStart)
  )
    records.push(currentPeriod);
  const firstLoadedMonth = records.map((p) => p.periodStart.slice(0, 7)).sort()[0];
  const years = [...new Set(records.map((p) => p.periodStart.slice(0, 4)))].sort((a, b) =>
    b.localeCompare(a),
  );
  return (
    <ul className="flex flex-col gap-2 py-1">
      {years.map((year) => (
        <li key={year} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
          <span className="w-18 shrink-0 text-muted">
            {year}
            <span className="block">Months</span>
          </span>
          <div className="grid w-fit grid-cols-6 gap-0.5 lg:grid-cols-12">
            {Array.from({ length: 12 }, (_, i) => {
              const start = `${year}-${String(i + 1).padStart(2, "0")}-01`;
              const end = new Date(Date.UTC(Number(year), i + 1, 0)).toISOString().slice(0, 10);
              return (
                <PeriodCircle
                  key={start}
                  monthly
                  unloaded={hasMore && start.slice(0, 7) < firstLoadedMonth}
                  start={start}
                  end={end}
                  today={today}
                  period={records.find((p) => p.periodStart.slice(0, 7) === start.slice(0, 7))}
                />
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AnnualHistory({ periods, today }: { periods: GoalPeriod[]; today: string }) {
  return (
    <ul className="flex flex-col gap-2 py-1">
      {periods.map((period) => (
        <li key={period.periodStart} className="flex items-center gap-2">
          <span className="w-18 text-muted">{period.periodStart.slice(0, 4)}</span>
          {period.progress >= period.target ? (
            <>
              <CircleCheckBig aria-hidden className="size-3.5 text-success-soft-foreground" />
              <span className="sr-only">Met</span>
            </>
          ) : (
            <span className="text-muted">
              {period.periodEnd < today ? "Missed" : "In progress"}
            </span>
          )}
          <span className="tabular-nums">
            {period.progress}/{period.target}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MixedAnnualHistory({
  periods,
  currentPeriod,
  today,
  hasMore,
}: {
  periods: GoalPeriod[];
  currentPeriod?: GoalProgress;
  today: string;
  hasMore: boolean;
}) {
  const annual = periods.filter((period) => period.repeat === "year");
  if (
    currentPeriod?.repeat === "year" &&
    !annual.some((period) => period.periodStart === currentPeriod.periodStart)
  )
    annual.unshift(currentPeriod);
  return (
    <>
      <AnnualHistory periods={annual} today={today} />
      <HistoryMonths
        periods={periods.filter((period) => period.repeat !== "year")}
        currentPeriod={currentPeriod?.repeat === "year" ? undefined : currentPeriod}
        today={today}
        hasMore={hasMore}
      />
    </>
  );
}

function HistoryMonths({
  periods,
  today,
  currentPeriod,
  hasMore,
}: {
  periods: GoalPeriod[];
  today: string;
  currentPeriod?: GoalProgress;
  hasMore: boolean;
}) {
  if (periods.length === 0 && !currentPeriod) return null;
  if (periods.some((period) => period.repeat === "year") || currentPeriod?.repeat === "year") {
    return (
      <MixedAnnualHistory
        periods={periods}
        currentPeriod={currentPeriod}
        today={today}
        hasMore={hasMore}
      />
    );
  }

  if (periods.every((p) => p.repeat === "month") && currentPeriod?.repeat !== "week")
    return (
      <HistoryYears
        periods={periods}
        today={today}
        currentPeriod={currentPeriod}
        hasMore={hasMore}
      />
    );
  const months = new Map<string, GoalPeriod[]>();
  for (const period of periods) {
    const month = period.periodStart.slice(0, 7);
    const group = months.get(month) ?? [];
    group.push(period);
    months.set(month, group);
  }
  if (currentPeriod?.repeat === "week") {
    const month = today.slice(0, 7);
    const current = months.get(month) ?? [];
    if (
      currentPeriod.periodStart.slice(0, 7) === month &&
      !current.some((p) => p.periodStart === currentPeriod.periodStart)
    )
      current.push(currentPeriod);
    months.set(month, current);
  }
  return (
    <ul className="flex flex-col gap-2 py-1">
      {[...months.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, group]) => (
          <li key={month} className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <span className="w-18 shrink-0 text-muted">
              <span>
                {goalDateLabel(
                  {
                    repeat: "month",
                    timeframe: "month",
                    periodStart: `${month}-01`,
                    periodEnd: `${month}-01`,
                  },
                  today,
                )}
              </span>
              {(group.some((period) => period.repeat === "week") ||
                (currentPeriod?.repeat === "week" && month === today.slice(0, 7))) && (
                <span className="block text-xs text-muted">Weeks</span>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-0.5">
              {group.some((period) => period.repeat === "week") ||
              (currentPeriod?.repeat === "week" && month === today.slice(0, 7))
                ? goalWeekSlots(month).map((slot) => (
                    <PeriodCircle
                      key={slot.periodStart}
                      start={slot.periodStart}
                      end={slot.periodEnd}
                      period={group.find((p) => p.periodStart === slot.periodStart)}
                      today={today}
                    />
                  ))
                : group.map((period) => (
                    <span key={period.periodStart} className="flex items-center gap-1 tabular-nums">
                      {period.progress >= period.target ? (
                        <>
                          <CircleCheckBig
                            aria-hidden
                            className="size-3.5 text-success-soft-foreground"
                          />
                          Met
                        </>
                      ) : (
                        `${period.periodEnd < today ? "Missed" : "In progress"} · ${period.progress}/${period.target}`
                      )}
                    </span>
                  ))}
            </div>
          </li>
        ))}
    </ul>
  );
}

function HistoryDisclosure({
  expanded,
  onExpandedChange,
  children,
}: {
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="text-xs [&_button]:min-h-6 [&_button]:tracking-normal [&_button]:normal-case [&>*]:gap-0">
      <DetailsDisclosure
        title="See history"
        isExpanded={expanded}
        onExpandedChange={onExpandedChange}
      >
        <div className="flex flex-col gap-1">{children}</div>
      </DetailsDisclosure>
    </div>
  );
}

export function GoalRecurringHistory({
  ownerId,
  goal,
  today,
  loadHistory,
  currentPeriod,
}: {
  ownerId: string;
  goal: GoalProgress;
  today: string;
  currentPeriod?: GoalProgress;
  loadHistory?: (offset: number, anchor?: string) => Promise<GoalHistoryPage>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [anchorMonth, setAnchorMonth] = useState(goal.recurring?.anchorMonth);
  const [monthOffset, setMonthOffset] = useState(goal.recurring?.nextOffset ?? 0);
  const [extra, setExtra] = useState<GoalPeriod[]>([]);
  const [moreAvailable, setMoreAvailable] = useState(goal.recurring?.hasMore ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const history = goal.recurring;
  if (!history) return null;
  if (history.total === 0) return null;
  const recent = history.recent;
  async function more() {
    setLoading(true);
    setError("");
    try {
      const offset = monthOffset;
      let page;
      if (loadHistory) page = await loadHistory(offset, anchorMonth);
      else {
        const params = new URLSearchParams({ historyId: String(goal.id), offset: String(offset) });
        if (anchorMonth) params.set("anchor", anchorMonth);
        const res = await apiFetch(`/api/users/${ownerId}/goals?${params}`);
        if (!res.ok) throw new Error("Could not load history. Try again.");
        page = (await res.json()) as GoalHistoryPage;
      }
      setExtra((current) => [...current, ...page.periods]);
      setMoreAvailable(page.hasMore);
      setMonthOffset(page.nextOffset);
      setAnchorMonth(page.anchorMonth);
    } catch {
      setError("Could not load history. Try again.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <HistoryDisclosure expanded={expanded} onExpandedChange={setExpanded}>
      <HistoryMonths
        periods={[...recent, ...extra]}
        today={today}
        currentPeriod={currentPeriod}
        hasMore={moreAvailable}
      />

      {moreAvailable && <LoadMoreButton loading={loading} onPress={more} failed={Boolean(error)} />}
    </HistoryDisclosure>
  );
}
