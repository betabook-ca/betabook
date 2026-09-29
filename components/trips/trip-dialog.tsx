"use client";

import { Button, type UseOverlayStateReturn } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveTrip } from "@/actions";
import { EMPTY_TRIP_DRAFT, TripForm, type TripDraft } from "@/components/trips/trip-form";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Trip, TripSummary } from "@/db/queries";
import type { LookupFetcher } from "@/hooks/use-search-lookup";
import { localToday } from "@/lib/format-date";
import type { CompanionOption } from "@/lib/journal-companions";
import { oneLine, tripHref } from "@/lib/trips";

const DATE_ORDER_MESSAGE = "End date must be on or after start date.";

type EditableTrip = Trip & Pick<TripSummary, "companions">;

/** A new trip starts on today's date, the same default every other date field
 * in the app opens on; the climber moves either end from there. */
function draftFor(trip: EditableTrip | undefined): TripDraft {
  if (!trip) {
    const today = localToday();
    return { ...EMPTY_TRIP_DRAFT, startDate: today, endDate: today };
  }
  return {
    name: trip.name,
    description: oneLine(trip.description ?? ""),
    albumUrl: trip.albumUrl ?? "",
    startDate: trip.startDate,
    endDate: trip.endDate,
    companions: trip.companions.map(({ id, name, image }) => ({ id, name, image })),
  };
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
  companionFetcher,
}: {
  state: UseOverlayStateReturn;
  userId: string;
  /** Absent when creating. */
  trip?: EditableTrip;
  /** Seam for stories and tests; production looks friends up over the API. */
  companionFetcher?: LookupFetcher<CompanionOption>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<TripDraft>(() => draftFor(trip));
  const [companionsChanged, setCompanionsChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(state.isOpen);

  // Every opening starts from the trip as it stands. Reset here, not by
  // remounting: a dialog mounted already open renders before it knows the
  // viewport, as the phone sheet, and has no focus to hand back on closing.
  if (state.isOpen !== wasOpen) {
    setWasOpen(state.isOpen);
    if (state.isOpen) {
      setDraft(draftFor(trip));
      setCompanionsChanged(false);
      setError(null);
    }
  }

  // Checked here as well as on the server so a backwards range is caught
  // before a round trip. The server still decides: this only shortens the
  // feedback loop, and the database's own CHECK is the backstop under both.
  const datesBackwards =
    Boolean(draft.startDate) && Boolean(draft.endDate) && draft.endDate < draft.startDate;
  const incomplete = !draft.name.trim() || !draft.startDate || !draft.endDate;

  function handleChange(next: TripDraft) {
    if (next.companions !== draft.companions) setCompanionsChanged(true);
    setDraft(next);
  }

  function handleSave() {
    if (pending || incomplete || datesBackwards) return;
    setError(null);
    startTransition(async () => {
      const result = await saveTrip(trip?.id ?? null, {
        name: draft.name,
        description: draft.description,
        albumUrl: draft.albumUrl,
        startDate: draft.startDate,
        endDate: draft.endDate,
        // An untouched selection is left out of an edit: what the dialog
        // opened on is only the tags this climber can see, and sending it
        // back would replace the rest.
        ...((!trip || companionsChanged) && {
          companions: draft.companions.map((friend) => friend.id),
        }),
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
      title={trip ? "Edit trip" : "New trip"}
      size="md"
      isPending={pending}
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
        onChange={handleChange}
        error={error}
        dateError={datesBackwards ? DATE_ORDER_MESSAGE : null}
        editing={Boolean(trip)}
        disabled={pending}
        companionFetcher={companionFetcher}
      />
    </ResponsiveDialog>
  );
}
