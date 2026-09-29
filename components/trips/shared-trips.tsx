import { UserSendLogRow } from "@/components/climb-log-row";
import { ProfileInvite } from "@/components/profile-invite";
import { TripCard } from "@/components/trips/trip-card";
import { TripStats } from "@/components/trips/trip-stats";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/typography";
import type { AreaBreadcrumbs, TripSummary, UserSendRow } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { profileSharePath, withProfileShare } from "@/lib/profile-share";
import { formatTripDates, tripsHref } from "@/lib/trips";

type Owner = { id: string; name: string; image: string | null; token: string };

/** A climber's trips for the signed-out holder of their profile link. */
export function SharedTrips({
  owner,
  trips,
  today,
}: {
  owner: Owner;
  trips: TripSummary[];
  today: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ProfileInvite
        name={owner.name}
        image={owner.image}
        next={withProfileShare(tripsHref(owner.id), owner.token)}
      />
      <section aria-label="Trips" className="flex min-w-0 flex-col gap-3">
        <AppLink href={profileSharePath(owner.id, owner.token)} className="text-sm text-muted">
          ← {owner.name}
        </AppLink>
        <SectionHeading>Trips</SectionHeading>
        {trips.length === 0 ? (
          <EmptyState message="No trips yet." />
        ) : (
          <ul className="flex flex-col gap-3">
            {trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                userId={owner.id}
                today={today}
                shareToken={owner.token}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One trip for the same reader: what it was and the sends dated inside it.
 * The journal's side of a trip follows the journal's audiences, which a
 * signed-out reader never meets. */
export function SharedTrip({
  owner,
  trip,
  sends,
  areaBreadcrumbs,
  path,
}: {
  owner: Owner;
  trip: TripSummary;
  sends: UserSendRow[];
  areaBreadcrumbs: AreaBreadcrumbs;
  /** This page, link included, for sign-up to return to. */
  path: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ProfileInvite name={owner.name} image={owner.image} next={path} />
      <section aria-label="Trip" className={`flex min-w-0 flex-col gap-2 ${cardClass("md")}`}>
        <AppLink
          href={withProfileShare(tripsHref(owner.id), owner.token)}
          className="text-sm text-muted"
        >
          ← All trips
        </AppLink>
        <SectionHeading>{trip.name}</SectionHeading>
        <p className="text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
        {trip.description && <p className="text-sm leading-relaxed">{trip.description}</p>}
        <TripStats trip={trip} />
      </section>
      <section aria-label="Sends" className="flex flex-col gap-3">
        <SectionHeading>Sends</SectionHeading>
        {sends.length < trip.sendCount && (
          <p className="text-sm text-muted">
            Showing the {sends.length} most recent of {formatCount(trip.sendCount, "send")}.
          </p>
        )}
        {sends.length === 0 ? (
          <EmptyState message={`${owner.name} didn't log a send on this trip.`} />
        ) : (
          <div className="flex flex-col divide-y divide-separator">
            {sends.map((send) => (
              // Keys reach the RSC payload; sequential send ids stay out of it.
              <UserSendLogRow key={send.climbId} send={send} areaBreadcrumbs={areaBreadcrumbs} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
