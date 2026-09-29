import { UserSendLogRow } from "@/components/climb-log-row";
import { ProfileInvite } from "@/components/profile-invite";
import { signUpPrompt } from "@/components/sign-up-card";
import { TripCard } from "@/components/trips/trip-card";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { SidebarLayout } from "@/components/ui/page-shell";
import { SectionHeading } from "@/components/ui/typography";
import { UserSendSummary } from "@/components/user-send-summary";
import type { AreaBreadcrumbs, TripSummary, UserSendRow, UserStatsSummary } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { withProfileShare } from "@/lib/profile-share";
import { tripsHref } from "@/lib/trips";

/** The climber's latest trips, each opened by the same link as this page. */
export type SharedProfileTrips = {
  userId: string;
  token: string;
  latest: TripSummary[];
  total: number;
  /** The reader's own `YYYY-MM-DD`, resolved on the server. */
  today: string;
};

/** Signed-out view of a valid share link. */
export function SharedProfile({
  owner,
  summary,
  sends,
  areaBreadcrumbs,
  trips,
  next,
}: {
  owner: { name: string; image: string | null };
  summary: UserStatsSummary;
  sends: UserSendRow[];
  areaBreadcrumbs: AreaBreadcrumbs;
  trips?: SharedProfileTrips;
  next: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ProfileInvite name={owner.name} image={owner.image} next={next} />
      <SidebarLayout sidebar={<UserSendSummary summary={summary} />}>
        <section aria-label="Recent sends" className="flex flex-col gap-3">
          <SectionHeading>Recent sends</SectionHeading>
          {sends.length === 0 ? (
            <EmptyState message={`${owner.name} hasn't logged a send yet.`} />
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
          sendCount: summary.sendCount,
          shown: sends.length,
          next,
        })}
        {trips && trips.total > 0 && (
          <section aria-label="Trips" className="flex flex-col gap-3">
            <SectionHeading>Trips</SectionHeading>
            <ul className="flex flex-col gap-3">
              {trips.latest.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  userId={trips.userId}
                  today={trips.today}
                  shareToken={trips.token}
                />
              ))}
            </ul>
            {trips.total > trips.latest.length && (
              <AppLink
                href={withProfileShare(tripsHref(trips.userId), trips.token)}
                className="text-sm"
              >
                All {formatCount(trips.total, "trip")}
              </AppLink>
            )}
          </section>
        )}
      </SidebarLayout>
    </div>
  );
}
