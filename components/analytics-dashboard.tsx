import type { ReactNode } from "react";

import { AnalyticsCalendar } from "@/components/analytics-calendar";
import { AnalyticsFlashChart } from "@/components/analytics-flash-chart";
import { AnalyticsGradePyramid } from "@/components/analytics-grade-pyramid";
import { StatTileContent, type StatTile } from "@/components/analytics-stat-tiles";
import { AnalyticsVolumeChart } from "@/components/analytics-volume-chart";
import { AnalyticsWorkspace, type AnalyticsPanel } from "@/components/analytics-workspace";
import { BreakthroughList } from "@/components/breakthrough-list";
import { ProgressionChart } from "@/components/progression-chart";
import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SectionHeading } from "@/components/ui/typography";
import type { AnalyticsSendRow } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import { buildAnalyticsHighlights } from "@/lib/analytics-highlights";
import type { AnalyticsLayout } from "@/lib/analytics-layout";
import { ANALYTICS_CARD_IDS, type AnalyticsCardId } from "@/lib/analytics-layout";
import { formatAnalyticsYears } from "@/lib/analytics-years";
import { sendChartRows, sessionChartRows, type ChartSession } from "@/lib/chart-details";
import { formatCount } from "@/lib/format";
import type { ClimbType } from "@/lib/grades";
import { formatDaySpan, formatMonthLabel, type UserAnalytics } from "@/lib/user-analytics";

const EMPTY_SESSIONS: ChartSession[] = [];

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
  canCustomize = false,
  initialLayout,
  onSave,
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
  canCustomize?: boolean;
  initialLayout?: AnalyticsLayout;
  onSave?: (layout: AnalyticsLayout) => Promise<ActionResult>;
}) {
  const chartSends = sends.filter(
    (send) =>
      send.climbType === scope &&
      (selectedYears.length === 0 ||
        (send.dateSent != null && selectedYears.includes(Number(send.dateSent.slice(0, 4))))),
  );
  const activities = journalVisible
    ? sessionChartRows(
        sessions.filter(
          (entry) =>
            entry.climbType === scope &&
            (!selectedYears.length || selectedYears.includes(Number(entry.entryDate.slice(0, 4)))),
        ),
        sends,
      )
    : sendChartRows(chartSends);
  const period = selectedYears.length ? formatAnalyticsYears(selectedYears) : null;
  const calendarYears = (selectedYears.length ? selectedYears : analytics.calendarYears).toSorted(
    (a, b) => a - b,
  );
  const hardest = analytics.hardest[0] ?? null;
  const firstTryCount = analytics.flashCount + analytics.onsightCount;
  const tiles: Record<AnalyticsCardId, StatTile> = {
    partner: {
      label: "Most frequent partner",
      value: highlights.partner?.name ?? "—",
      sub: highlights.partner
        ? formatCount(highlights.partner.days, "shared day")
        : "no visible tagged partners",
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
        ? `${formatMonthLabel(analytics.dateSpan[0].slice(0, 7))} – ${formatMonthLabel(analytics.dateSpan[1].slice(0, 7))}`
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
      label: "First try",
      value: analytics.sendCount
        ? `${Math.round((firstTryCount / analytics.sendCount) * 100)}%`
        : "—",
      sub:
        analytics.sendCount === 0
          ? "no sends yet"
          : analytics.hardestFirstTry
            ? `Hardest: ${analytics.hardestFirstTry.label}`
            : `${analytics.flashCount} flash · ${analytics.onsightCount} onsight`,
    },
    streak: {
      label: journalVisible ? "Longest streak" : "Longest send streak",
      value: analytics.longestStreak ? formatCount(analytics.longestStreak.days, "day") : "—",
      sub: analytics.longestStreak
        ? formatMonthLabel(analytics.longestStreak.end.slice(0, 7))
        : "no dated activity",
    },
    bestYear: {
      label: "Best year",
      value: analytics.bestYear?.year ?? "—",
      sub: analytics.bestYear ? formatCount(analytics.bestYear.count, "send") : "no dated sends",
    },
    busiestMonth: {
      label: "Busiest month",
      value: analytics.busiestMonth ? formatMonthLabel(analytics.busiestMonth.month) : "—",
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
        ? `${formatMonthLabel(analytics.longestLayoff.from.slice(0, 7))} – ${formatMonthLabel(analytics.longestLayoff.to.slice(0, 7))}`
        : "no gaps between dated activity",
    },
  };
  const descriptions: Record<AnalyticsCardId, string> = {
    partner: "Who you shared the most tagged climbing days with.",
    biggestProject: "The climb with the most logged sessions, sent or unsent.",
    persistence: "The most sessions leading up to a first send in this period.",
    favoriteRepeat: "The climb you repeated most after its original ascent.",
    sends: "How many climbs you’ve sent.",
    hardest: "Your highest graded send.",
    days: "Days with climbing activity.",
    firstTry: "The share of sends you flashed or onsighted.",
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
      description: "Total sends and the percentage flashed at each grade.",
      content: (
        <AnalyticsFlashChart
          sends={chartSends}
          rows={analytics.flashByGrade.find((group) => group.type === scope)?.rows ?? []}
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
              Best grade in the selected years — each dot is the hardest send of that month.
            </p>
          </div>
          {analytics.progression.length ? (
            <ProgressionChart
              type={scope}
              points={analytics.progression[0].points}
              sends={chartSends}
            />
          ) : (
            <p className="text-sm text-muted">
              No dated sends with grades yet — progression appears once sends carry dates.
            </p>
          )}
        </section>
      ),
    },
    {
      id: "pyramid",
      title: "Grade pyramid",
      content: (
        <section aria-label="Grade pyramid" className="min-w-0">
          <div className="mb-4 flex flex-col gap-1">
            <Eyebrow>Grade pyramid</Eyebrow>
            <p className="text-xs text-muted">Sends per grade, hardest on top.</p>
          </div>
          {pyramidRows.length ? (
            <AnalyticsGradePyramid type={scope} rows={pyramidRows} sends={chartSends} />
          ) : (
            <p className="text-sm text-muted">
              {period == null ? "No graded sends yet." : `No graded sends in ${period}.`}
            </p>
          )}
        </section>
      ),
    },
    {
      id: "breakthroughs",
      title: "Breakthroughs",
      content: (
        <section aria-label="Breakthroughs" className="min-w-0">
          <div className="mb-4 flex flex-col gap-1">
            <Eyebrow>Breakthroughs</Eyebrow>
            <p className="text-xs text-muted">
              New highest grades within the selected years, starting with the first graded send.
            </p>
          </div>
          {analytics.breakthroughs.length ? (
            <BreakthroughList breakthroughs={analytics.breakthroughs} showDiscipline={false} />
          ) : (
            <p className="text-sm text-muted">
              No dated breakthroughs yet — they need sends with both a grade and a date.
            </p>
          )}
        </section>
      ),
    },
    {
      id: "calendar",
      title: journalVisible ? "Outdoor calendar" : "Sending calendar",
      content: (
        <section
          aria-label={journalVisible ? "Outdoor calendar" : "Sending calendar"}
          className="min-w-0"
        >
          <div className="mb-4 flex flex-col gap-1">
            <Eyebrow>{journalVisible ? "Outdoor calendar" : "Sending calendar"}</Eyebrow>
            <p className="text-xs text-muted">
              {journalVisible
                ? "Climb sessions per day"
                : "Sends per day — darker squares, bigger days."}
            </p>
          </div>
          {calendarYears.length ? (
            <AnalyticsCalendar
              key={calendarYears.join(",")}
              years={calendarYears}
              countsByDay={analytics.calendarCounts}
              activities={activities}
              hue={DISCIPLINE_HUE[scope]}
              unit={journalVisible ? "session" : "send"}
            />
          ) : (
            <p className="text-sm text-muted">
              {journalVisible
                ? "No outdoor sessions yet — the calendar fills in as sessions are logged."
                : "No dated sends yet — the calendar fills in as sends carry dates."}
            </p>
          )}
        </section>
      ),
    },
  ];
  return (
    <section aria-label="Activity summary" className="flex flex-col gap-6">
      <AnalyticsWorkspace
        cards={cards}
        charts={charts}
        canCustomize={canCustomize}
        initialLayout={initialLayout}
        onSave={onSave}
        heading={
          <div className="flex flex-col gap-1">
            <SectionHeading>
              {period == null ? "All-time activity" : `Activity in ${period}`}
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
                : "Sends without dates aren’t included in the selected years. Choose All to include them in your totals and grade pyramid."}
            </p>
          )}
          {period != null && analytics.sendCount === 0 && analytics.daysOut === 0 && (
            <p role="status" className="text-sm text-muted">
              No activity in {period} for this discipline. Try another year or All.
            </p>
          )}
        </div>
      </AnalyticsWorkspace>
    </section>
  );
}
