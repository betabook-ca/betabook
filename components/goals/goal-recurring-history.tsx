"use client";

import { Button, Tooltip } from "@heroui/react";
import { CircleCheckBig } from "lucide-react";
import { useState, type ReactNode } from "react";

import { DetailsDisclosure } from "@/components/ui/details-disclosure";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { usePagedList } from "@/hooks/use-paged-list";
import { apiFetch } from "@/lib/api-client";
import { goalDateLabel } from "@/lib/goal-date-label";
import { goalWeekSlots } from "@/lib/goal-week-slots";
import type { GoalPeriod, GoalProgress, GoalHistoryPage } from "@/lib/goals";

function periodStatus(period: GoalPeriod, today: string) {
  if (period.progress >= period.target) return "Met";
  return period.periodEnd < today ? "Missed" : "In progress";
}

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
  const status =
    period && (met || start <= today)
      ? periodStatus(period, today)
      : start > today
        ? "Upcoming"
        : end >= today
          ? "In progress"
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
  hasMore,
  recurringEndDate,
}: {
  periods: GoalPeriod[];
  today: string;
  hasMore: boolean;
  recurringEndDate?: string | null;
}) {
  const firstLoadedMonth = periods.map((p) => p.periodStart.slice(0, 7)).sort()[0];
  const years = [...new Set(periods.map((p) => p.periodStart.slice(0, 4)))].sort((a, b) =>
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
              if (recurringEndDate && start > recurringEndDate) return null;
              const end = new Date(Date.UTC(Number(year), i + 1, 0)).toISOString().slice(0, 10);
              return (
                <PeriodCircle
                  key={start}
                  monthly
                  unloaded={hasMore && start.slice(0, 7) < firstLoadedMonth}
                  start={start}
                  end={end}
                  today={today}
                  period={periods.find((p) => p.periodStart.slice(0, 7) === start.slice(0, 7))}
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
          {periodStatus(period, today) === "Met" ? (
            <>
              <CircleCheckBig aria-hidden className="size-3.5 text-success-soft-foreground" />
              <span className="sr-only">Met</span>
            </>
          ) : (
            <span className="text-muted">{periodStatus(period, today)}</span>
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
  recurringEndDate,
}: {
  periods: GoalPeriod[];
  currentPeriod?: GoalProgress;
  today: string;
  hasMore: boolean;
  recurringEndDate?: string | null;
}) {
  const annual = periods.filter((period) => period.repeat === "year");
  return (
    <>
      <AnnualHistory periods={annual} today={today} />
      <HistoryMonths
        periods={periods.filter((period) => period.repeat !== "year")}
        currentPeriod={currentPeriod?.repeat === "year" ? undefined : currentPeriod}
        today={today}
        hasMore={hasMore}
        recurringEndDate={recurringEndDate}
      />
    </>
  );
}

function HistoryMonths({
  periods,
  today,
  currentPeriod,
  hasMore,
  recurringEndDate,
}: {
  periods: GoalPeriod[];
  today: string;
  currentPeriod?: GoalProgress;
  hasMore: boolean;
  recurringEndDate?: string | null;
}) {
  const records =
    currentPeriod &&
    !periods.some(
      (period) =>
        period.repeat === currentPeriod.repeat &&
        period.periodStart === currentPeriod.periodStart &&
        period.periodEnd === currentPeriod.periodEnd,
    )
      ? [currentPeriod, ...periods]
      : periods;
  if (records.length === 0) return null;
  if (records.some((period) => period.repeat === "year")) {
    return (
      <MixedAnnualHistory
        periods={records}
        currentPeriod={currentPeriod}
        today={today}
        hasMore={hasMore}
        recurringEndDate={recurringEndDate}
      />
    );
  }

  if (records.every((p) => p.repeat === "month"))
    return (
      <HistoryYears
        periods={records}
        today={today}
        hasMore={hasMore}
        recurringEndDate={recurringEndDate}
      />
    );
  const months = new Map<string, GoalPeriod[]>();
  for (const period of records) {
    const month = period.periodStart.slice(0, 7);
    const group = months.get(month) ?? [];
    group.push(period);
    months.set(month, group);
  }
  if (currentPeriod?.repeat === "week") {
    const month = today.slice(0, 7);
    if (!months.has(month)) months.set(month, []);
  }
  return (
    <ul className="flex flex-col gap-2 py-1">
      {[...months.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, group]) => {
          const hasWeeks =
            group.some((period) => period.repeat === "week") ||
            (currentPeriod?.repeat === "week" && month === today.slice(0, 7));
          return (
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
                {hasWeeks && <span className="block text-xs text-muted">Weeks</span>}
              </span>
              <div className="flex flex-wrap items-center gap-0.5">
                {hasWeeks &&
                  goalWeekSlots(month)
                    .filter((slot) => !recurringEndDate || slot.periodStart <= recurringEndDate)
                    .map((slot) => (
                      <PeriodCircle
                        key={slot.periodStart}
                        start={slot.periodStart}
                        end={slot.periodEnd}
                        period={group.find(
                          (period) =>
                            period.repeat === "week" &&
                            period.periodStart === slot.periodStart &&
                            period.periodEnd ===
                              (recurringEndDate && recurringEndDate < slot.periodEnd
                                ? recurringEndDate
                                : slot.periodEnd),
                        )}
                        today={today}
                      />
                    ))}
                {group
                  .filter((period) => period.repeat !== "week")
                  .map((period) => (
                    <span
                      key={`${period.repeat}-${period.periodStart}-${period.periodEnd}`}
                      className="flex basis-full items-center gap-1 tabular-nums"
                    >
                      {periodStatus(period, today) === "Met" && (
                        <CircleCheckBig
                          aria-hidden
                          className="size-3.5 text-success-soft-foreground"
                        />
                      )}
                      {`${hasWeeks ? "Month · " : ""}${periodStatus(period, today)} · ${period.progress}/${period.target}`}
                    </span>
                  ))}
              </div>
            </li>
          );
        })}
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

type HistoryProps = {
  ownerId: string;
  goal: GoalProgress;
  today: string;
  currentPeriod?: GoalProgress;
  loadHistory?: (offset: number, anchor?: string) => Promise<GoalHistoryPage>;
};

type HistoryCursor = {
  anchorMonth?: string;
  /** Request offset by page: each response hands back the next page's, so a
   * snapshot refresh re-walks the loaded pages from its own first page. */
  offsets: Record<number, number>;
};

export function GoalRecurringHistory(props: HistoryProps) {
  const history = props.goal.recurring;
  if (!history || history.total === 0) return null;
  return <RecurringHistoryPages {...props} history={history} />;
}

function RecurringHistoryPages({
  ownerId,
  goal,
  history,
  today,
  loadHistory,
  currentPeriod,
}: HistoryProps & { history: NonNullable<GoalProgress["recurring"]> }) {
  const [expanded, setExpanded] = useState(false);
  const list = usePagedList<GoalPeriod, HistoryCursor>({
    initialItems: history.recent,
    initialHasMore: history.hasMore,
    initialMeta: { anchorMonth: history.anchorMonth, offsets: { 2: history.nextOffset ?? 0 } },
    itemKey: (period) => `${period.repeat}-${period.periodStart}-${period.periodEnd}`,
    mergeMeta: (current, incoming) => ({
      anchorMonth: incoming.anchorMonth,
      offsets: { ...current.offsets, ...incoming.offsets },
    }),
    fetchPage: async (_offset, page, _last, signal, cursor) => {
      const next = await fetchHistoryPage(page, signal, cursor);
      return {
        items: next.periods,
        hasMore: next.hasMore,
        meta: { anchorMonth: next.anchorMonth, offsets: { [page + 1]: next.nextOffset } },
      };
    },
  });
  async function fetchHistoryPage(
    page: number,
    signal: AbortSignal,
    { anchorMonth, offsets }: HistoryCursor,
  ): Promise<GoalHistoryPage> {
    const offset = offsets[page];
    if (loadHistory) return loadHistory(offset, anchorMonth);
    const params = new URLSearchParams({ historyId: String(goal.id), offset: String(offset) });
    if (anchorMonth) params.set("anchor", anchorMonth);
    const res = await apiFetch(`/api/users/${ownerId}/goals?${params}`, { signal });
    if (!res.ok) throw new Error(res.statusText);
    return (await res.json()) as GoalHistoryPage;
  }
  return (
    <HistoryDisclosure expanded={expanded} onExpandedChange={setExpanded}>
      <HistoryMonths
        periods={list.items}
        today={today}
        currentPeriod={currentPeriod}
        hasMore={list.hasMore}
        recurringEndDate={goal.recurringEndDate}
      />
      {list.hasMore && (
        <LoadMoreButton
          loading={list.loadingMore}
          onPress={list.loadMore}
          failed={list.loadMoreFailed}
        />
      )}
    </HistoryDisclosure>
  );
}
