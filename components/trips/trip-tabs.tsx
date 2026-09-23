"use client";

import { SectionNavigation } from "@/components/ui/section-navigation";
import { tripHref, type TripTab } from "@/lib/trips";

/** Journal, Sends and Analytics are three views of one window rather than
 * three sections, so they sit inside the Trips workspace tab as pills — the
 * same shape Projects uses for Open and Sent.
 *
 * `current` is passed in by each page rather than derived from the pathname,
 * so the trip's own page (Journal) does not light up as a prefix of the two
 * routes nested under it. */
export function TripTabs({
  userId,
  tripId,
  current,
}: {
  userId: string;
  tripId: number;
  current: TripTab;
}) {
  return (
    <SectionNavigation
      appearance="pills"
      label="Trip views"
      tabs={[
        { href: tripHref(userId, tripId), label: "Journal", current: current === "journal" },
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
      ]}
    />
  );
}
