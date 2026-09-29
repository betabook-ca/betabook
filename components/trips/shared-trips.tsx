import type { ReactNode } from "react";

import { UserSendLogRow } from "@/components/climb-log-row";
import { SendRows } from "@/components/send-rows";
import { signUpPrompt } from "@/components/sign-up-card";
import { TripHeader } from "@/components/trips/trip-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/typography";
import type { AreaBreadcrumbs, TripSummary, UserSendRow } from "@/db/queries";
import { formatCount } from "@/lib/format";

type Owner = { id: string; name: string; token: string };

/** A trip for the signed-out holder of the climber's profile link: the header
 * a member sees, and the sends dated inside it. The journal's side of a trip
 * follows the journal's audiences and the notes are for friends, neither of
 * which a signed-out reader meets. */
export function SharedTrip({
  owner,
  trip,
  sends,
  areaBreadcrumbs,
  path,
  today,
  photos,
}: {
  owner: Owner;
  trip: TripSummary;
  sends: UserSendRow[];
  areaBreadcrumbs: AreaBreadcrumbs;
  /** This page, link included, for sign-up to return to. */
  path: string;
  today: string;
  /** The trip's shared album, when it has one. */
  photos?: ReactNode;
}) {
  return (
    <TripHeader
      trip={trip}
      userId={owner.id}
      viewerId={null}
      today={today}
      current="sends"
      journalVisible={false}
      notesVisible={false}
      share={owner.token}
    >
      {photos}
      <div className="flex min-w-0 flex-col gap-4">
        <SectionHeading className="sr-only">Sends</SectionHeading>
        {sends.length < trip.sendCount && (
          <p className="text-sm text-muted">
            Showing the {sends.length} most recent of {formatCount(trip.sendCount, "send")}.
          </p>
        )}
        {sends.length === 0 ? (
          <EmptyState message={`${owner.name} hasn't logged a send on this trip yet.`} />
        ) : (
          <SendRows>
            {sends.map((send) => (
              // Keys reach the RSC payload; sequential send ids stay out of it.
              <li key={send.climbId}>
                <UserSendLogRow send={send} areaBreadcrumbs={areaBreadcrumbs} />
              </li>
            ))}
          </SendRows>
        )}
        {signUpPrompt({
          ownerName: owner.name,
          sendCount: trip.sendCount,
          shown: sends.length,
          next: path,
        })}
      </div>
    </TripHeader>
  );
}
