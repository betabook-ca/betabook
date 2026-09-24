import type { ReactNode } from "react";

import { AnalyticsCalendarPanel } from "@/components/analytics-calendar-panel";
import { AnalyticsFlashChart } from "@/components/analytics-flash-chart";
import { AnalyticsGradePyramid } from "@/components/analytics-grade-pyramid";
import { StatTileContent, type StatTile } from "@/components/analytics-stat-tiles";
import { AnalyticsVolumeChart } from "@/components/analytics-volume-chart";
import { AnalyticsWorkspace, type AnalyticsPanel } from "@/components/analytics-workspace";
import { BreakthroughList } from "@/components/breakthrough-list";
import { ProgressionChart } from "@/components/progression-chart";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SectionHeading } from "@/components/ui/typography";
import type { AnalyticsSendRow } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import { buildAnalyticsHighlights } from "@/lib/analytics-highlights";
import type { AnalyticsLayout } from "@/lib/analytics-layout";
import { ANALYTICS_CARD_IDS, type AnalyticsCardId } from "@/lib/analytics-layout";
import { formatAnalyticsYears } from "@/lib/analytics-years";
import {
  selectChartSends,
  sendChartRows,
  sessionChartRows,
  type ChartSession,
} from "@/lib/chart-details";
import { formatCount } from "@/lib/format";
import { formatMonth } from "@/lib/format-date";
import type { ClimbType } from "@/lib/grades";
import { formatDaySpan, inSelectedYears, type UserAnalytics } from "@/lib/user-analytics";

const EMPTY_SESSIONS: ChartSession[] = [];
const NO_PANELS: AnalyticsPanel[] = [];

/** Every summary and chart reads the same filtered analytics; customization changes presentation only. */
// oxlint-disable-next-line complexity -- independent summary and empty-chart states
export function AnalyticsDashboard({
  analytics,
  sends,
  sessions = EMPTY_SESSIONS,
  undatedCount,
  scope,
  journalVisible,
  selectedYears,
  periodPicker,
  summary,
  activityHeading,
  canCustomize = false,
  initialLayout,
  onSave,
  shareCard,
  highlights = buildAnalyticsHighlights([], scope, selectedYears),
}: {
  analytics: UserAnalytics;
  sends: AnalyticsSendRow[];
  sessions?: ChartSession[];
  highlights?: ReturnType<typeof buildAnalyticsHighlights>;
  undatedCount: number;
  scope: ClimbType;
  journalVisible: boolean;
  selectedYears: number[];
  periodPicker: ReactNode;
  /** The climber's all-time record, under the activity heading. */
  summary?: ReactNode;
  /** Replaces the computed "All-time activity" / "Activity in <year>" heading.
   * A trip selects no years — its window is already narrower than one — so the
   * computed heading would announce an eleven-day window as all-time. */
  activityHeading?: string;
  canCustomize?: boolean;
  initialLayout?: AnalyticsLayout;
  onSave?: (layout: AnalyticsLayout) => Promise<ActionResult>;
  /** The owner's seasonal Year in review launcher, beside Customize. */
  shareCard?: ReactNode;
}) {
  const chartSends = selectChartSends(sends, scope, selectedYears);
  const activities = journalVisible
    ? sessionChartRows(
        sessions.filter(
          (entry) => entry.climbType === scope && inSelectedYears(entry.entryDate, selectedYears),
        ),
        sends,
      )
    : sendChartRows(chartSends);
  const period = selectedYears.length ? formatAnalyticsYears(selectedYears) : null;
  const noActivity = period != null && analytics.sendCount === 0 && analytics.daysOut === 0;
  const hasCalendarActivity = journalVisible
    ? sessions.some((entry) => inSelectedYears(entry.entryDate, selectedYears))
    : sends.some((send) => send.dateSent != null && inSelectedYears(send.dateSent, selectedYears));
  const calendarTitle = journalVisible ? "Outdoor calendar" : "Sending calendar";
  const hardest = analytics.hardest[0] ?? null;
  const tiles: Record<AnalyticsCardId, StatTile> = {
    partner: {
      label: "Most tagged friend",
      value: highlights.partner?.name ?? "—",
      sub: highlights.partner
        ? formatCount(highlights.partner.days, "shared day")
        : "no tagged friends",
    },
    biggestProject: {
      label: "Biggest project",
      value: highlights.biggestProject
        ? formatCount(highlights.biggestProject.sessions, "session")
        : "—",
      sub: highlights.biggestProject
        ? `${highlights.biggestProject.name} · ${highlights.biggestProject.firstSend ? "sent" : highlights.biggestProject.repeats ? "repeated" : "no first send in this period"}`
        : "no logged sessions",
    },
    persistence: {
      label: "Persistence paid off",
      value: highlights.persistence ? formatCount(highlights.persistence.attempts, "session") : "—",
      sub: highlights.persistence
        ? `${highlights.persistence.name} · sessions through the send`
        : "no sends after multiple logged sessions",
    },
    favoriteRepeat: {
      label: "Favorite repeat",
      value: highlights.favoriteRepeat
        ? formatCount(highlights.favoriteRepeat.repeats, "repeat")
        : "—",
      sub: highlights.favoriteRepeat?.name ?? "no repeat ascents logged",
    },
    sends: {
      label: "Sends",
      value: analytics.sendCount,
      sub: analytics.dateSpan
        ? `${formatMonth(analytics.dateSpan[0].slice(0, 7))} – ${formatMonth(analytics.dateSpan[1].slice(0, 7))}`
        : "no dated sends",
    },
    hardest: {
      label: "Hardest",
      value: hardest?.label ?? "—",
      sub: hardest ? hardest.climbName : "no graded sends",
    },
    days: {
      label: journalVisible ? "Days out" : "Sending days",
      value: analytics.daysOut,
      sub: analytics.daysPerMonth != null ? `${analytics.daysPerMonth.toFixed(1)} per month` : null,
    },
    firstTry: {
      label: "Flash",
      value: analytics.sendCount
        ? `${Math.round((analytics.firstTryCount / analytics.sendCount) * 100)}%`
        : "—",
      sub:
        analytics.sendCount === 0
          ? "no sends"
          : analytics.hardestFirstTry
            ? `Hardest: ${analytics.hardestFirstTry.label}`
            : // Boulders are never onsights, so the split would only ever read "0 onsight".
              scope === "boulder"
              ? `${analytics.flashCount} flash`
              : `${analytics.flashCount} flash · ${analytics.onsightCount} onsight`,
    },
    streak: {
      label: journalVisible ? "Longest streak" : "Longest send streak",
      value: analytics.longestStreak ? formatCount(analytics.longestStreak.days, "day") : "—",
      sub: analytics.longestStreak
        ? formatMonth(analytics.longestStreak.end.slice(0, 7))
        : "no dated activity",
    },
    bestYear: {
      label: "Best year",
      value: analytics.bestYear?.year ?? "—",
      sub: analytics.bestYear ? formatCount(analytics.bestYear.count, "send") : "no dated sends",
    },
    busiestMonth: {
      label: "Busiest month",
      value: analytics.busiestMonth ? formatMonth(analytics.busiestMonth.month) : "—",
      sub: analytics.busiestMonth
        ? formatCount(analytics.busiestMonth.count, "send")
        : "no dated sends",
    },
    areas: {
      label: "Areas",
      value: analytics.areaCount,
      sub: analytics.topArea ? `Most sends: ${analytics.topArea.name}` : null,
    },
    favoriteDay: {
      label: "Favorite day",
      value: analytics.favoriteWeekday?.weekday ?? "—",
      sub: analytics.favoriteWeekday
        ? formatCount(analytics.favoriteWeekday.count, "send")
        : "no dated sends",
    },
    layoff: {
      label: journalVisible ? "Longest layoff" : "Longest send gap",
      value: analytics.longestLayoff ? formatDaySpan(analytics.longestLayoff.days) : "—",
      sub: analytics.longestLayoff
        ? `${formatMonth(analytics.longestLayoff.from.slice(0, 7))} – ${formatMonth(analytics.longestLayoff.to.slice(0, 7))}`
        : "no gaps between dated activity",
    },
  };
  const descriptions: Record<AnalyticsCardId, string> = {
    partner: "The friend you tagged on the most days.",
    biggestProject: "The climb with the most logged sessions, sent or unsent.",
    persistence: "The most sessions leading up to a first send in this period.",
    favoriteRepeat: "The climb you repeated most after its original ascent.",
    sends: "How many climbs you’ve sent.",
    hardest: "Your highest graded send.",
    days: "Days with climbing activity.",
    firstTry:
      scope === "boulder"
        ? "The share of sends you flashed."
        : "The share of sends you flashed or onsighted.",
    bestYear: "The year with the most sends.",
    streak: "Your longest run of consecutive climbing days.",
    busiestMonth: "The month with the most sends.",
    areas: "How many areas you’ve sent climbs in.",
    favoriteDay: "The day of the week you send most often.",
    layoff: "The longest gap between climbing days.",
  };
  const cards: AnalyticsPanel[] = ANALYTICS_CARD_IDS.map((id) => ({
    id,
    title: tiles[id].label,
    description: descriptions[id],
    content: <StatTileContent tile={tiles[id]} />,
  }));
  const pyramidRows = analytics.pyramid[0]?.rows ?? [];
  const charts: AnalyticsPanel[] = [
    {
      id: "volume",
      title: "Volume over time",
      description: "Monthly sends or climbing days.",
      content: (
        <AnalyticsVolumeChart
          rows={analytics.volume}
          sends={chartSends}
          activities={activities}
          type={scope}
          journalVisible={journalVisible}
        />
      ),
    },
    {
      id: "flashRate",
      title: "Flash rate by grade",
      description: "Total sends and the flash rate at each grade.",
      content: (
        <AnalyticsFlashChart
          sends={chartSends}
          rows={analytics.firstTryByGrade.find((group) => group.type === scope)?.rows ?? []}
          type={scope}
        />
      ),
    },
    {
      id: "progression",
      title: "Progression",
      content: (
        <section aria-label="Progression" className="min-w-0">
          <div className="mb-4 flex flex-col gap-1">
            <Eyebrow>Progression</Eyebrow>
            <p className="text-xs text-muted">
              Each dot is a month’s hardest send; the line is your best so far.
            </p>
          </div>
          {analytics.progression.length ? (
            <ProgressionChart
              type={scope}
              points={analytics.progression[0].points}
              sends={chartSends}
            />
          ) : (
            <p className="text-sm text-muted">No dated sends with grades.</p>
          )}
        </section>
      ),
    },
    {
      id: "pyramid",
      title: "Grade pyramid",
      content: (
        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-1">
            <Eyebrow>Grade pyramid</Eyebrow>
            <p className="text-xs text-muted">Sends per grade, hardest on top.</p>
          </div>
          {pyramidRows.length ? (
            <AnalyticsGradePyramid type={scope} rows={pyramidRows} sends={chartSends} />
          ) : (
            <p className="text-sm text-muted">No graded sends.</p>
          )}
        </div>
      ),
    },
    {
      id: "breakthroughs",
      title: "Breakthroughs",
      content: (
        <section aria-label="Breakthroughs" className="min-w-0">
          <div className="mb-4 flex flex-col gap-1">
            <Eyebrow>Breakthroughs</Eyebrow>
            <p className="text-xs text-muted">Sends that set a new highest grade, newest first.</p>
          </div>
          {analytics.breakthroughs.length ? (
            <BreakthroughList breakthroughs={analytics.breakthroughs} />
          ) : (
            <p className="text-sm text-muted">No dated sends with grades.</p>
          )}
        </section>
      ),
    },
    {
      id: "calendar",
      title: calendarTitle,
      content: (
        <AnalyticsCalendarPanel
          sends={sends}
          sessions={sessions}
          selectedYears={selectedYears}
          journalVisible={journalVisible}
        />
      ),
    },
  ];
  const visibleCharts = noActivity
    ? hasCalendarActivity
      ? charts.filter((chart) => chart.id === "calendar")
      : NO_PANELS
    : charts;
  return (
    <AnalyticsWorkspace
      cards={noActivity ? NO_PANELS : cards}
      charts={visibleCharts}
      canCustomize={canCustomize && !noActivity}
      initialLayout={initialLayout}
      onSave={onSave}
      actions={noActivity ? undefined : shareCard}
      heading={
        <div className="flex flex-col gap-1">
          <SectionHeading>
            {activityHeading ?? (period == null ? "All-time activity" : `Activity in ${period}`)}
          </SectionHeading>
          {summary && <p className="text-sm text-muted">{summary}</p>}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {periodPicker}
        {undatedCount > 0 && (
          <p className="text-xs text-muted">
            {period == null
              ? "Sends without dates count toward your totals and grade pyramid, but won’t appear in charts that track activity over time."
              : "Sends without dates aren’t included in the selected years. Choose All years to include them in your totals and grade pyramid."}
          </p>
        )}
        {noActivity && (
          <p role="status" className="text-sm text-muted">
            No activity in {period} for this discipline. Try another year or All years.
          </p>
        )}
      </div>
    </AnalyticsWorkspace>
  );
}
