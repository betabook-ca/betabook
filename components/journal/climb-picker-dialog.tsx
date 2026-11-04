"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { ClimbPicker } from "@/components/climb-picker";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { ClimbWithAreaName } from "@/db/queries";
import type { ClimbSelectionContext, SearchFetcher } from "@/lib/search";

/** Choosing a climb to add to a list, over the form that holds the list, so
 * the form and everything typed into it stay put while the search is open.
 * A pick closes it.
 *
 * Fullscreen: with the keyboard up, a sheet would show about two results. */
export function ClimbPickerDialog({
  state,
  title,
  sentClimbIds,
  disabledClimbIds,
  fetcher,
  onPick,
}: {
  state: UseOverlayStateReturn;
  title: string;
  sentClimbIds?: Set<number>;
  /** Climb id to the reason it can't be picked, such as already being in the list. */
  disabledClimbIds?: ReadonlyMap<number, string>;
  fetcher?: SearchFetcher;
  onPick: (climb: ClimbWithAreaName, context: ClimbSelectionContext) => void;
}) {
  return (
    <ResponsiveDialog state={state} title={title} size="lg" presentation="fullscreen">
      <ClimbPicker
        showFilters={false}
        allowSentClimbs
        sentClimbIds={sentClimbIds}
        disabledClimbIds={disabledClimbIds}
        fetcher={fetcher}
        onPick={(climb, context) => {
          onPick(climb, context);
          state.close();
        }}
      />
    </ResponsiveDialog>
  );
}
