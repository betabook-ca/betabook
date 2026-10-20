import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { DisciplineScopeNav } from "@/components/discipline-scope-nav";
import { EmptyState } from "@/components/ui/empty-state";
import type { AnalyticsSendRow, AnalyticsSessionRow } from "@/db/queries";
import { TRIP_ANALYTICS_LAYOUT } from "@/lib/analytics-layout";
import type { ClimbType } from "@/lib/grades";
import { getViewerGradePreferences } from "@/lib/session";
import {
  buildUserAnalytics,
  inDateWindow,
  parseDisciplineScope,
  resolveDisciplineScope,
} from "@/lib/user-analytics";

const NO_YEARS: number[] = [];

/**
 * Analytics for one trip: sends, hardest send, days out, flash rate and the
 * grade pyramid.
 *
 * Rows are filtered to the trip's dates before `buildUserAnalytics` runs, so
 * every stat covers only the trip, whatever window the caller's read used.
 * The member page reads the whole history and relies on this; a trip link's
 * reads are already limited to the trip in SQL.
 */
export async function TripAnalytics({
  trip,
  userId,
  sends: allSends,
  sessions: allSessions,
  discipline,
  disciplineHref,
}: {
  trip: { id: number; startDate: string; endDate: string };
  userId: string;
  sends: AnalyticsSendRow[];
  /** Undefined when the reader can't see the journal. */
  sessions: AnalyticsSessionRow[] | undefined;
  discipline: string | undefined;
  /** Link to the same page scoped to one discipline. */
  disciplineHref: (type: ClimbType) => string;
}) {
  const inTrip = (date: string | null) => inDateWindow(date, trip.startDate, trip.endDate);
  const rows = allSends.filter((row) => inTrip(row.dateSent));
  const sessions = allSessions?.filter((entry) => inTrip(entry.entryDate));

  const { present, scope } = resolveDisciplineScope({
    rows,
    sessions,
    requested: parseDisciplineScope(discipline),
  });

  if (scope == null) return <EmptyState message="Nothing logged on this trip yet." />;

  const analytics = buildUserAnalytics(
    rows,
    scope,
    sessions,
    NO_YEARS,
    await getViewerGradePreferences(),
  );

  return (
    <AnalyticsDashboard
      activityHeading="Activity on this trip"
      // Not the trip id: the key reaches the page, and a trip link's readers
      // aren't given it.
      key={`${userId}-${trip.startDate}-${trip.endDate}`}
      // A fixed layout, not the user's saved one, and not editable here.
      canCustomize={false}
      initialLayout={TRIP_ANALYTICS_LAYOUT}
      // A per-month average isn't meaningful for a trip.
      analytics={{ ...analytics, daysPerMonth: null }}
      sends={rows}
      // The date filter already excludes undated sends.
      undatedCount={0}
      scope={scope}
      journalVisible={sessions !== undefined}
      selectedYears={NO_YEARS}
      periodPicker={<DisciplineScopeNav present={present} scope={scope} href={disciplineHref} />}
    />
  );
}
