"use client";

import { Button, useOverlayState } from "@heroui/react";
import { CirclePlus } from "lucide-react";
import { useState } from "react";

import { TripActions } from "@/components/trips/trip-actions";
import { TripCard } from "@/components/trips/trip-card";
import { TripDialog } from "@/components/trips/trip-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/typography";
import type { TripSummary } from "@/db/queries";

/** The climber's trips, newest first, with the one control that creates them.
 *
 * There is no filtering or pagination here on purpose. A climber has tens of
 * trips, not thousands — the cap in `lib/trips.ts` says so — and a toolbar over
 * a list that fits on one screen is furniture, not help. */
export function TripList({
  trips,
  userId,
  today,
  canEdit,
}: {
  trips: TripSummary[];
  userId: string;
  /** The reader's own `YYYY-MM-DD`, resolved on the server so the status chips
   * cannot disagree between the render and the hydration. */
  today: string;
  /** The climber reading their own list; anyone else only reads. */
  canEdit: boolean;
}) {
  const createState = useOverlayState();
  // A fresh mount per open, so a trip abandoned half-typed is not what the
  // next New trip starts from.
  const [session, setSession] = useState(0);

  function openCreate() {
    setSession((count) => count + 1);
    createState.open();
  }

  const newTrip = (
    <Button onPress={openCreate} className="self-end">
      <CirclePlus className="size-4" />
      New trip
    </Button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeading className="sr-only">Trips</SectionHeading>
      {/* One "New trip" on screen at a time: the empty state carries it while
       * there are no trips, and showing both put two identical buttons on the
       * same empty screen. */}
      {canEdit && trips.length > 0 && newTrip}

      {trips.length > 0 ? null : canEdit ? (
        <EmptyState message="No trips yet." cta={newTrip} />
      ) : (
        <EmptyState message="No trips yet." />
      )}

      {trips.length > 0 && (
        <ul className="flex flex-col gap-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              userId={userId}
              today={today}
              actions={canEdit && <TripActions trip={trip} userId={userId} />}
            />
          ))}
        </ul>
      )}

      {canEdit && <TripDialog key={session} state={createState} userId={userId} />}
    </div>
  );
}
