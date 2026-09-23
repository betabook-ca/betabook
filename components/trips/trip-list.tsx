"use client";

import { Button, Menu, useOverlayState } from "@heroui/react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteTrip } from "@/actions";
import { TripCard } from "@/components/trips/trip-card";
import { TripDialog } from "@/components/trips/trip-dialog";
import { ActionsMenu } from "@/components/ui/actions-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
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
}: {
  trips: TripSummary[];
  userId: string;
  /** The reader's own `YYYY-MM-DD`, resolved on the server so the status chips
   * cannot disagree between the render and the hydration. */
  today: string;
}) {
  const router = useRouter();
  const editState = useOverlayState();
  const deleteState = useOverlayState();
  const [editing, setEditing] = useState<TripSummary | undefined>(undefined);
  // Bumped every time the dialog is opened, and part of its key, so each
  // session gets a fresh mount. Keying by trip id alone is not enough: the
  // dialog resets its draft from the trip it was handed, on a timer after it
  // closes, and a saved edit keeps the same id — so the next Edit on that trip
  // would reopen showing the values the save replaced.
  const [session, setSession] = useState(0);
  const [deleting, setDeleting] = useState<TripSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openEditor(trip?: TripSummary) {
    setEditing(trip);
    setSession((count) => count + 1);
    editState.open();
  }

  function handleDelete() {
    if (!deleting) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteTrip(deleting.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      deleteState.close();
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading className="sr-only">Trips</SectionHeading>
        {/* What the climber gets, not how it works. An earlier draft explained
         * the mechanism — a window, nothing moved — which is a reassurance
         * only someone worried about duplicated data needs, and raises a doubt
         * the reader did not arrive with.
         *
         * Hidden while the list is empty, where the empty state makes the same
         * promise with the instruction attached. Two sentences saying one
         * thing is worse than either alone. */}
        {trips.length > 0 && (
          <p className="text-sm text-muted">Everything from one trip, in one place.</p>
        )}
        {/* One "New trip" on screen at a time. While the list is empty the
         * empty state carries it, where the climber is already reading; once
         * there are trips it moves up here, clear of the cards. Showing both
         * put two identical buttons on the same empty screen. */}
        {trips.length > 0 && (
          <Button onPress={() => openEditor()} className="shrink-0">
            <Plus className="size-4" />
            New trip
          </Button>
        )}
      </div>

      {trips.length === 0 ? (
        <EmptyState
          message="No trips yet. Add the dates you were away and that trip's sessions, sends and stats come with it."
          cta={
            <Button onPress={() => openEditor()}>
              <Plus className="size-4" />
              New trip
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              userId={userId}
              today={today}
              actions={
                <ActionsMenu
                  ariaLabel={`Actions for ${trip.name}`}
                  onAction={(key) => {
                    if (key === "edit") {
                      openEditor(trip);
                    } else {
                      setDeleting(trip);
                      setDeleteError(null);
                      deleteState.open();
                    }
                  }}
                >
                  <Menu.Item id="edit">Edit</Menu.Item>
                  <Menu.Item id="delete">Delete</Menu.Item>
                </ActionsMenu>
              }
            />
          ))}
        </ul>
      )}

      {/* Keyed by the session as well as the trip, so every open starts from
       * the trip as it stands now rather than from whatever the last session
       * left behind. */}
      <TripDialog
        key={`${editing?.id ?? "new"}-${session}`}
        state={editState}
        userId={userId}
        trip={editing}
      />

      <ConfirmDeleteDialog
        state={deleteState}
        noun="trip"
        title={deleting ? `Delete ${deleting.name}?` : "Delete this trip?"}
        description="Deleting a trip won't delete any climbs — your sessions and sends stay in your logbook."
        onConfirm={handleDelete}
        isPending={pending}
        error={deleteError}
      />
    </div>
  );
}
