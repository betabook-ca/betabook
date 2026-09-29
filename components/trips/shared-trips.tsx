import { UserSendLogRow } from "@/components/climb-log-row";
import { ProfileInvite } from "@/components/profile-invite";
import { signUpPrompt } from "@/components/sign-up-card";
import { TripBackLink } from "@/components/trips/trip-back-link";
import { TripCard } from "@/components/trips/trip-card";
import { TripStats } from "@/components/trips/trip-stats";
import { TripStatusChip } from "@/components/trips/trip-status-chip";
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
        <TripBackLink href={profileSharePath(owner.id, owner.token)}>{owner.name}</TripBackLink>
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
  today,
}: {
  owner: Owner;
  trip: TripSummary;
  sends: UserSendRow[];
  areaBreadcrumbs: AreaBreadcrumbs;
  /** This page, link included, for sign-up to return to. */
  path: string;
  today: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ProfileInvite name={owner.name} image={owner.image} next={path} />
      <section aria-label="Trip" className="flex min-w-0 flex-col gap-1">
        <TripBackLink href={withProfileShare(tripsHref(owner.id), owner.token)}>
          All trips
        </TripBackLink>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SectionHeading className="min-w-0 break-words">{trip.name}</SectionHeading>
          <TripStatusChip trip={trip} today={today} />
        </div>
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
          <EmptyState message={`${owner.name} hasn't logged a send on this trip yet.`} />
        ) : (
          <div className="flex flex-col divide-y divide-separator">
            {sends.map((send) => (
              // Keys reach the RSC payload; sequential send ids stay out of it.
              <UserSendLogRow key={send.climbId} send={send} areaBreadcrumbs={areaBreadcrumbs} />
            ))}
          </div>
        )}
      </section>
      {signUpPrompt({
        ownerName: owner.name,
        sendCount: trip.sendCount,
        shown: sends.length,
        next: path,
      })}
    </div>
  );
}
