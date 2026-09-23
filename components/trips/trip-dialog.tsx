"use client";

import { Button, type UseOverlayStateReturn } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveTrip } from "@/actions";
import { EMPTY_TRIP_DRAFT, TripForm, type TripDraft } from "@/components/trips/trip-form";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Trip } from "@/db/queries";
import { tripHref } from "@/lib/trips";

const DATE_ORDER_MESSAGE = "End date must be on or after start date.";

function draftFor(trip: Trip | undefined): TripDraft {
  return trip
    ? {
        name: trip.name,
        description: trip.description ?? "",
        startDate: trip.startDate,
        endDate: trip.endDate,
      }
    : EMPTY_TRIP_DRAFT;
}

/** Creates a trip or edits one, in the overlay form the rest of the app uses.
 *
 * Editing the dates moves the window and nothing else: a trip owns no entries,
 * so widening one to take in a week already logged is an ordinary edit rather
 * than a migration, and narrowing one loses nothing. That is why this dialog
 * has no warning about what an edit will "affect" — there is nothing to
 * affect.
 *
 * A new trip navigates to itself on success, because the reason to make one is
 * to look at it. An edit stays put: the climber was already looking at the
 * thing they just corrected. */
export function TripDialog({
  state,
  userId,
  trip,
}: {
  state: UseOverlayStateReturn;
  userId: string;
  /** Absent when creating. */
  trip?: Trip;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<TripDraft>(() => draftFor(trip));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Checked here as well as on the server so a backwards range is caught
  // before a round trip. The server still decides: this only shortens the
  // feedback loop, and the database's own CHECK is the backstop under both.
  const datesBackwards =
    Boolean(draft.startDate) && Boolean(draft.endDate) && draft.endDate < draft.startDate;
  const incomplete = !draft.name.trim() || !draft.startDate || !draft.endDate;

  function handleSave() {
    if (pending || incomplete || datesBackwards) return;
    setError(null);
    startTransition(async () => {
      const result = await saveTrip(trip?.id ?? null, {
        name: draft.name,
        description: draft.description,
        startDate: draft.startDate,
        endDate: draft.endDate,
      });
      if (!result.ok) {
        // Stay open so the climber can correct the field rather than retype
        // the whole trip.
        setError(result.error);
        return;
      }
      state.close();
      if (trip) router.refresh();
      else router.push(tripHref(userId, result.value));
    });
  }

  return (
    <ResponsiveDialog
      state={state}
      title={trip ? `Edit ${trip.name}` : "New trip"}
      size="md"
      isPending={pending}
      onClose={() => {
        setDraft(draftFor(trip));
        setError(null);
      }}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button variant="ghost" isDisabled={pending} onPress={state.close}>
            Cancel
          </Button>
          <Button isDisabled={pending || incomplete || datesBackwards} onPress={handleSave}>
            {trip ? "Save changes" : "Create trip"}
          </Button>
        </div>
      }
    >
      <TripForm
        draft={draft}
        onChange={setDraft}
        error={error}
        dateError={datesBackwards ? DATE_ORDER_MESSAGE : null}
      />
    </ResponsiveDialog>
  );
}
