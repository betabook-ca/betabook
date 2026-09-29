"use client";

import { Menu, useOverlayState } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteTrip } from "@/actions";
import { TripDialog } from "@/components/trips/trip-dialog";
import { ActionsMenu } from "@/components/ui/actions-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { TripSummary } from "@/db/queries";
import type { LookupFetcher } from "@/hooks/use-search-lookup";
import type { CompanionOption } from "@/lib/journal-companions";
import { tripsHref } from "@/lib/trips";

/** What the owner can do to one trip, the same from its card and its page. */
export function TripActions({
  trip,
  userId,
  leaveOnDelete = false,
  companionFetcher,
}: {
  trip: TripSummary;
  userId: string;
  /** On the trip's own page, where deleting it leaves nothing to show. */
  leaveOnDelete?: boolean;
  /** Seam for stories and tests; production looks friends up over the API. */
  companionFetcher?: LookupFetcher<CompanionOption>;
}) {
  const router = useRouter();
  const editState = useOverlayState();
  const deleteState = useOverlayState();
  // Bumped on every open and used as the dialog's key. The dialog resets its
  // draft from the trip it was handed, on a timer after it closes, so without
  // a fresh mount the next Edit would show what the last save replaced.
  const [session, setSession] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteTrip(trip.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      deleteState.close();
      if (leaveOnDelete) router.push(tripsHref(userId));
      else router.refresh();
    });
  }

  return (
    <>
      <ActionsMenu
        ariaLabel={`Actions for ${trip.name}`}
        onAction={(key) => {
          if (key === "edit") {
            setSession((count) => count + 1);
            editState.open();
          } else {
            setDeleteError(null);
            deleteState.open();
          }
        }}
      >
        <Menu.Item id="edit">Edit</Menu.Item>
        <Menu.Item id="delete">Delete</Menu.Item>
      </ActionsMenu>

      <TripDialog
        key={session}
        state={editState}
        userId={userId}
        trip={trip}
        companionFetcher={companionFetcher}
      />

      <ConfirmDeleteDialog
        state={deleteState}
        noun="trip"
        description="Deleting a trip won't delete any climbs — your sessions and sends stay in your logbook."
        onConfirm={handleDelete}
        isPending={pending}
        error={deleteError}
      />
    </>
  );
}
