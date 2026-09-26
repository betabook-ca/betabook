import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import {
  getTripShareContext,
  resolveTripPage,
  tripMetadata,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { DisciplineScopeNav } from "@/components/discipline-scope-nav";
import { TripHeader } from "@/components/trips/trip-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { getAnalyticsHighlightSessions } from "@/db/queries/analytics-highlights";
import { getAnalyticsLayout } from "@/db/queries/analytics-layout";
import { buildAnalyticsHighlights } from "@/lib/analytics-highlights";
import { formatTripDates, tripHref } from "@/lib/trips";
import {
  buildUserAnalytics,
  inDateWindow,
  parseDisciplineScope,
  resolveDisciplineScope,
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
  const { share, shareOrigin } = await getTripShareContext(user.id, trip.id);

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

  const { present, scope } = resolveDisciplineScope({
    rows,
    sessions,
    requested: parseDisciplineScope(
      typeof search.discipline === "string" ? search.discipline : undefined,
    ),
  });

  if (scope == null) {
    return (
      <ProfileHeader user={user} viewerId={user.id} workspace="logbook">
        <TripHeader
          trip={trip}
          userId={user.id}
          current="analytics"
          share={share}
          shareOrigin={shareOrigin}
        >
          <EmptyState message={`Nothing logged between ${dates}.`} />
        </TripHeader>
      </ProfileHeader>
    );
  }

  const analytics = buildUserAnalytics(rows, scope, sessions, NO_YEARS);
  const initialLayout = await getAnalyticsLayout(db, user.id, user.id);

  return (
    <ProfileHeader user={user} viewerId={user.id} workspace="logbook">
      <TripHeader
        trip={trip}
        userId={user.id}
        current="analytics"
        share={share}
        shareOrigin={shareOrigin}
      >
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
            <DisciplineScopeNav
              present={present}
              scope={scope}
              href={(type) => `${tripHref(user.id, trip.id, "analytics")}?discipline=${type}`}
            />
          }
        />
      </TripHeader>
    </ProfileHeader>
  );
}
