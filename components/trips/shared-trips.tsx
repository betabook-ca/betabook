import type { ReactNode } from "react";

import { signUpPrompt } from "@/components/sign-up-card";
import { TripDays } from "@/components/trips/trip-days";
import { TripHeader } from "@/components/trips/trip-header";
import type { AreaBreadcrumbs, TripSummary, UserSendRow } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { groupTripDays, type TripDayOrder } from "@/lib/trip-days";

type Owner = { id: string; name: string; token: string };

/** Trip page for a signed-out visitor with a share link: the same header as the
 * signed-in view, then notes and sends grouped by day. Journal-gated data is
 * never shown. */
export function SharedTrip({
  owner,
  trip,
  sends,
  areaBreadcrumbs,
  path,
  today,
  order,
  photos,
  notes,
}: {
  owner: Owner;
  trip: TripSummary;
  sends: UserSendRow[];
  areaBreadcrumbs: AreaBreadcrumbs;
  /** This page's path, including the share token. Used as the return path after
   * sign-up. */
  path: string;
  today: string;
  /** Order the days start in, from the URL. */
  order?: TripDayOrder;
  /** Album section, if the trip has one. */
  photos?: ReactNode;
  /** Notes section, if the trip has notes. */
  notes?: ReactNode;
}) {
  // Only the latest sends are read, so the oldest day read may be partial.
  const { days } = groupTripDays({
    startDate: trip.startDate,
    sends,
    entries: [],
    sendsCapped: sends.length < trip.sendCount,
  });
  // Counts the sends the days hold, which can be fewer than were read.
  const shown = days.flatMap((day) => day.items).length;
  return (
    <TripHeader trip={trip} userId={owner.id} viewerId={null} today={today} share={owner.token}>
      {photos}
      {notes}
      <section aria-label="Sends" className="flex min-w-0 flex-col gap-3">
        <TripDays
          heading="Sends"
          initialOrder={order}
          days={days}
          areaBreadcrumbs={areaBreadcrumbs}
          userId={owner.id}
          isOwner={false}
          emptyMessage={`${owner.name} hasn't logged a send on this trip yet.`}
          notice={
            shown < trip.sendCount && (
              <p>
                Showing the {shown} most recent of {formatCount(trip.sendCount, "send")}.
              </p>
            )
          }
        />
        {signUpPrompt({
          ownerName: owner.name,
          sendCount: trip.sendCount,
          shown,
          next: path,
        })}
      </section>
    </TripHeader>
  );
}
