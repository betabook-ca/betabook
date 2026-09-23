import { buttonVariants } from "@heroui/react";

import { AscentStyle } from "@/components/ascent-style";
import { SendGradeCell } from "@/components/send-grade-cell";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { ClampedComment } from "@/components/ui/clamped-comment";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { SharedTrip, SharedTripEntry, SharedTripSend } from "@/db/queries";
import { formatDate } from "@/lib/format-date";
import { signUpUrl } from "@/lib/sign-in-redirect";
import { SITE_NAME } from "@/lib/site";
import { climbHref } from "@/lib/slug";
import { formatTripDates } from "@/lib/trips";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-sm text-muted">
      <span className="font-medium text-foreground">{value}</span> {label}
    </span>
  );
}

function SendRow({ send }: { send: SharedTripSend }) {
  return (
    <li className={`flex flex-col gap-2 ${cardClass("sm", "bordered")}`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <AppLink href={climbHref(send.climbId, send.climbName)} className="font-medium">
            {send.climbName}
          </AppLink>
          <span className="text-sm text-muted">{send.areaName}</span>
        </div>
        <span className="text-sm text-muted">{formatDate(send.dateSent)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* The send as the owner logged it: their suggested grade, how it
         * felt, and their rating — the same cell their own Sends list uses. */}
        <SendGradeCell
          type={send.climbType}
          grade={send.suggestedGrade}
          gradeFeel={send.gradeFeel ?? "solid"}
          rating={send.rating}
        />
        <AscentStyle type={send.ascentStyle} />
      </div>
      {send.comment && (
        <div className="text-sm leading-relaxed text-foreground">
          <ClampedComment>{send.comment}</ClampedComment>
        </div>
      )}
    </li>
  );
}

function EntryRow({ entry }: { entry: SharedTripEntry }) {
  return (
    <li className={`flex flex-col gap-2 ${cardClass("sm", "bordered")}`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        {entry.climbId != null && entry.climbName ? (
          <div className="flex min-w-0 flex-col">
            <AppLink href={climbHref(entry.climbId, entry.climbName)} className="font-medium">
              {entry.climbName}
            </AppLink>
            {entry.areaName && <span className="text-sm text-muted">{entry.areaName}</span>}
          </div>
        ) : (
          <span className="font-medium">{entry.kind === "training" ? "Training" : "Session"}</span>
        )}
        <span className="text-sm text-muted">{formatDate(entry.entryDate)}</span>
      </div>
      {entry.body && (
        <div className="text-sm leading-relaxed text-foreground">
          <ClampedComment>{entry.body}</ClampedComment>
        </div>
      )}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entry.tags.map((tag) => (
            <span key={tag} className="text-sm text-muted">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

/** What a valid trip link shows: one climber, one stretch of dates, and
 * everything they logged inside it — the owner's own view of the trip, which
 * is what they chose to show by making the link.
 *
 * Their profile is linked, and reachable anyway: a link only resolves while
 * the profile is public. Their other trips are not, because the Trips tab is
 * owner-only by every read and this link grants one trip. Each climb is
 * linked, since the catalog is public to everyone.
 *
 * Companion tags are the one thing the owner's own timeline carries that this
 * page does not. They name a friend who agreed to appear on the owner's
 * journal, not to be named to whoever holds a link — the one party here who
 * never saw the share dialog. */
export function SharedTrip({
  trip,
  entries,
  sends,
  signedIn,
  path,
}: {
  trip: SharedTrip;
  entries: SharedTripEntry[];
  sends: SharedTripSend[];
  signedIn: boolean;
  /** Where sign-up should return to, so the invitation lands back here. */
  path: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Shared trip" className={`flex flex-col gap-4 ${cardClass("md")}`}>
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar name={trip.ownerName} image={trip.ownerImage} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <PageTitle className="break-words">{trip.name}</PageTitle>
            <p className="text-sm text-muted">
              <AppLink href={`/users/${trip.ownerId}`}>{trip.ownerName}</AppLink> ·{" "}
              {formatTripDates(trip.startDate, trip.endDate)}
            </p>
          </div>
        </div>

        {trip.description && <p className="text-sm leading-relaxed">{trip.description}</p>}

        {/* The same three counts the owner's own trip card carries, read
         * through the same SQL fragments, so the two cannot disagree — down to
         * "days logged" rather than "days out", which means something narrower
         * on the Analytics tab. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Stat value={trip.dayCount} label={trip.dayCount === 1 ? "day logged" : "days logged"} />
          <Stat value={trip.entryCount} label={trip.entryCount === 1 ? "entry" : "entries"} />
          <Stat value={trip.sendCount} label={trip.sendCount === 1 ? "send" : "sends"} />
        </div>
      </section>

      <section aria-label="Sends" className="flex flex-col gap-3">
        <SectionHeading>Sends</SectionHeading>
        {sends.length === 0 ? (
          <EmptyState message={`${trip.ownerName} didn't log a send on this trip.`} />
        ) : (
          <ul className="flex flex-col gap-3">
            {sends.map((send) => (
              <SendRow key={`${send.climbId}-${send.dateSent}`} send={send} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Journal" className="flex flex-col gap-3">
        <SectionHeading>Journal</SectionHeading>
        {entries.length === 0 ? (
          <EmptyState message={`${trip.ownerName} didn't log a session on this trip.`} />
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      {!signedIn && (
        <section
          aria-label={`Climb with ${trip.ownerName} on ${SITE_NAME}`}
          className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${cardClass("md", "bordered")}`}
        >
          <p className="text-sm text-muted">
            {SITE_NAME} is a climbing logbook and crag database. Keep your own trips and see the
            sessions behind every send.
          </p>
          <AppLink href={signUpUrl(path)} className={`${buttonVariants()} shrink-0`}>
            Sign up
          </AppLink>
        </section>
      )}
    </div>
  );
}
