import { AnalyticsDashboard, buildStatTiles } from "@/components/analytics-dashboard";
import { DisciplineScopeNav } from "@/components/discipline-scope-nav";
import { TripShareImage } from "@/components/trips/trip-share-image";
import { EmptyState } from "@/components/ui/empty-state";
import type { AnalyticsSendRow, AnalyticsSessionRow } from "@/db/queries";
import { buildAnalyticsHighlights } from "@/lib/analytics-highlights";
import { TRIP_ANALYTICS_LAYOUT } from "@/lib/analytics-layout";
import type { ClimbType } from "@/lib/grades";
import { getViewerGradePreferences } from "@/lib/session";
import type { ShareImageContent, ShareStat } from "@/lib/share-image";
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
  shareImage,
}: {
  trip: { id: number; startDate: string; endDate: string };
  userId: string;
  sends: AnalyticsSendRow[];
  /** Undefined when the reader can't see the journal. */
  sessions: AnalyticsSessionRow[] | undefined;
  discipline: string | undefined;
  /** Link to the same page scoped to one discipline. */
  disciplineHref: (type: ClimbType) => string;
  /** Owner only: the trip header for the share image. Leave it out and there
   * is no Share image button. */
  shareImage?: Omit<ShareImageContent, "stats">;
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

  const journalVisible = sessions !== undefined;
  const analytics = {
    ...buildUserAnalytics(rows, scope, sessions, NO_YEARS, await getViewerGradePreferences()),
    // A per-month average isn't meaningful for a trip.
    daysPerMonth: null,
  };
  // Shared with the share image, so its tiles always match the page's.
  const highlights = buildAnalyticsHighlights([], scope, NO_YEARS);
  const disciplineNav = (
    <DisciplineScopeNav present={present} scope={scope} href={disciplineHref} />
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
      analytics={analytics}
      highlights={highlights}
      sends={rows}
      // The date filter already excludes undated sends.
      undatedCount={0}
      scope={scope}
      journalVisible={journalVisible}
      selectedYears={NO_YEARS}
      periodPicker={
        shareImage ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {disciplineNav}
            <div className="ml-auto">
              <TripShareImage
                content={shareImage}
                stats={shareImageStats({ analytics, highlights, scope, journalVisible })}
              />
            </div>
          </div>
        ) : (
          disciplineNav
        )
      }
    />
  );
}

/** The page's stat cards, built from the same inputs as the dashboard's. */
function shareImageStats(input: Parameters<typeof buildStatTiles>[0]): ShareStat[] {
  const tiles = buildStatTiles(input);
  return TRIP_ANALYTICS_LAYOUT.cards.map((id) => ({
    id,
    label: tiles[id].label,
    value: String(tiles[id].value),
    sub: tiles[id].sub ?? null,
  }));
}
