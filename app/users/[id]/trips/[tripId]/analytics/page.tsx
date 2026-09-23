import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import {
  resolveTripPage,
  tripMetadata,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { TripHeader } from "@/components/trips/trip-header";
import { AppLink } from "@/components/ui/app-link";
import { choicePillClass } from "@/components/ui/choice-pill";
import { DISCIPLINE_CHIP_CLASSNAME, DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { getAnalyticsHighlightSessions } from "@/db/queries/analytics-highlights";
import { getAnalyticsLayout } from "@/db/queries/analytics-layout";
import { buildAnalyticsHighlights } from "@/lib/analytics-highlights";
import type { ClimbType } from "@/lib/grades";
import { formatTripDates, tripHref } from "@/lib/trips";
import {
  buildUserAnalytics,
  DISCIPLINE_ORDER,
  inDateWindow,
  parseDisciplineScope,
} from "@/lib/user-analytics";

const NO_YEARS: number[] = [];

export async function generateMetadata({ params }: TripPageParams): Promise<Metadata> {
  const { id, tripId } = await params;
  return tripMetadata(id, tripId);
}

/**
 * The trip's own numbers.
 *
 * Every row is filtered to the window *before* aggregation, and no years are
 * selected, so each stat below describes the trip and nothing outside it. That
 * ordering is the whole design: `buildUserAnalytics` derives progression and
 * breakthroughs by comparing rows against each other, so handing it the full
 * history would quietly report lifetime facts on a page about eleven days.
 *
 * Filtering in JS rather than SQL matches what the main analytics page already
 * does for its year filter, and reuses those reads unchanged. `goalCountSql`
 * in `db/queries/goals.ts` is the `BETWEEN` precedent if this ever needs to
 * narrow in the database instead.
 */
export default async function TripAnalyticsPage({ params, searchParams }: TripPageParams) {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveTripPage(id, tripId);
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { trip, user } = resolved;

  const db = await getDb();
  const [allSends, allSessions, highlights] = await Promise.all([
    getUserSendsForAnalytics(db, user.id, user.id),
    getJournalSessionsForAnalytics(db, user.id, user.id),
    getAnalyticsHighlightSessions(db, user.id, user.id, []),
  ]);

  const inTrip = (date: string | null) => inDateWindow(date, trip.startDate, trip.endDate);
  const rows = allSends.filter((row) => inTrip(row.dateSent));
  const sessions = allSessions.filter((entry) => inTrip(entry.entryDate));
  const tripHighlights = highlights.filter((entry) => inTrip(entry.entryDate));

  const dates = formatTripDates(trip.startDate, trip.endDate);

  // Grades only compare within one discipline, so the page is always scoped to
  // one — the same rule the main analytics page follows.
  const present = DISCIPLINE_ORDER.filter(
    (type) =>
      rows.some((row) => row.climbType === type) ||
      sessions.some((entry) => entry.climbType === type),
  );
  const requested = parseDisciplineScope(
    typeof search.discipline === "string" ? search.discipline : undefined,
  );
  const dominant = [...present].sort(
    (a, b) =>
      sessions.filter((entry) => entry.climbType === b).length -
      sessions.filter((entry) => entry.climbType === a).length,
  )[0];
  const scope = requested !== "all" && present.includes(requested) ? requested : (dominant ?? null);

  if (scope == null) {
    return (
      <ProfileHeader user={user} viewerId={user.id} workspace="logbook">
        <TripHeader trip={trip} userId={user.id} current="analytics">
          <EmptyState message={`Nothing logged between ${dates}.`} />
        </TripHeader>
      </ProfileHeader>
    );
  }

  const analytics = buildUserAnalytics(rows, scope, sessions, NO_YEARS);
  const initialLayout = await getAnalyticsLayout(db, user.id, user.id);

  function disciplineHref(type: ClimbType) {
    return `${tripHref(user.id, trip.id, "analytics")}?discipline=${type}`;
  }

  return (
    <ProfileHeader user={user} viewerId={user.id} workspace="logbook">
      <TripHeader trip={trip} userId={user.id} current="analytics">
        <AnalyticsDashboard
          activityHeading="Activity on this trip"
          // No summary line: the header above already states the trip's dates,
          // and anything counted here is scoped to one discipline, so a second
          // total beside it would contradict the tiles below.
          key={`${user.id}-${trip.id}`}
          // Read so the trip's dashboard matches the order the climber already
          // chose under Progress, but not writable here: customising in two
          // places would have both surfaces writing one saved layout, and the
          // trip is a view of their numbers rather than a second home for the
          // setting.
          canCustomize={false}
          initialLayout={initialLayout}
          analytics={analytics}
          sends={rows}
          sessions={tripHighlights}
          highlights={buildAnalyticsHighlights(tripHighlights, scope, NO_YEARS)}
          // Undated sends are excluded by the window itself, so there is never
          // a remainder to report here the way the year view has to.
          undatedCount={0}
          scope={scope}
          journalVisible
          selectedYears={NO_YEARS}
          periodPicker={
            present.length > 1 && (
              <nav aria-label="Discipline" className="flex flex-wrap gap-2">
                {present.map((type) => (
                  <AppLink
                    key={type}
                    href={disciplineHref(type)}
                    aria-current={type === scope ? "true" : undefined}
                    className={choicePillClass(type === scope, DISCIPLINE_CHIP_CLASSNAME[type])}
                  >
                    {DISCIPLINE_LABELS[type]}
                  </AppLink>
                ))}
              </nav>
            )
          }
        />
      </TripHeader>
    </ProfileHeader>
  );
}
