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

/** Owner actions for a trip. Used on the trip card and the trip page. */
export function TripActions({
  trip,
  userId,
  leaveOnDelete = false,
  companionFetcher,
}: {
  trip: TripSummary;
  userId: string;
  /** Set on the trip page, to go back to the list after deleting. */
  leaveOnDelete?: boolean;
  /** For stories and tests. Production looks friends up through the API. */
  companionFetcher?: LookupFetcher<CompanionOption>;
}) {
  const router = useRouter();
  const editState = useOverlayState();
  const deleteState = useOverlayState();
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
          if (key === "edit") editState.open();
          else {
            setDeleteError(null);
            deleteState.open();
          }
        }}
      >
        <Menu.Item id="edit">Edit</Menu.Item>
        <Menu.Item id="delete">Delete</Menu.Item>
      </ActionsMenu>

      <TripDialog
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
