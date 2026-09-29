"use client";

import { SectionNavigation } from "@/components/ui/section-navigation";
import { tripHref, type TripTab } from "@/lib/trips";

/** Journal, Sends and Analytics are three views of one window rather than
 * three sections, so they sit inside the Trips workspace tab as pills — the
 * same shape Projects uses for Open and Sent. Notes sits with them as the
 * trip's own page of writing.
 *
 * `current` is passed in by each page rather than derived from the pathname,
 * so the trip's own page does not light up as a prefix of the routes nested
 * under it. For a reader the journal is not shared with, that page shows the
 * sends, as the profile's own root does. */
export function TripTabs({
  userId,
  tripId,
  current,
  showJournal,
  showNotes,
}: {
  userId: string;
  tripId: number;
  current: TripTab;
  showJournal: boolean;
  showNotes: boolean;
}) {
  return (
    <SectionNavigation
      appearance="pills"
      label="Trip views"
      tabs={[
        ...(showJournal
          ? [{ href: tripHref(userId, tripId), label: "Journal", current: current === "journal" }]
          : []),
        {
          href: tripHref(userId, tripId, "sends"),
          label: "Sends",
          current: current === "sends",
        },
        {
          href: tripHref(userId, tripId, "analytics"),
          label: "Analytics",
          current: current === "analytics",
        },
        ...(showNotes
          ? [
              {
                href: tripHref(userId, tripId, "notes"),
                label: "Notes",
                current: current === "notes",
              },
            ]
          : []),
      ]}
    />
  );
}
