"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useState } from "react";

import { JournalEntryComposer } from "@/components/journal/journal-entry-composer";
import type { JournalEntryFieldsProps } from "@/components/journal/journal-entry-fields";
import { JournalEntryForm } from "@/components/journal/journal-entry-form";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { PageTitle } from "@/components/ui/typography";
import type { SendableClimb } from "@/db/queries";

type JournalEntryDrawerProps = {
  climb?: SendableClimb & { name: string };
  sentClimbIds?: Set<number>;
  state: UseOverlayStateReturn;
  onSave?: JournalEntryFieldsProps["onSave"];
};

/** Logging an entry. This is the overlay opened most often, usually from a
 * phone, so it's a sheet there — the form stays near the thumb and resizes
 * against the keyboard. On desktop it centers like every other dialog. */
export function JournalEntryDrawer({
  climb,
  sentClimbIds,
  state,
  onSave,
}: JournalEntryDrawerProps) {
  const [pending, setPending] = useState(false);
  // The climb search is a search field over a result list, which wants the
  // whole phone screen rather than a sheet's 85vh — with a keyboard up the
  // sheet caps after about two results. Only the presentation changes, so
  // the picker keeps its query and results across the switch.
  const [browsing, setBrowsing] = useState(false);
  return (
    <ResponsiveDialog
      state={state}
      title="Log entry"
      hideTitle
      isPending={pending}
      presentation={browsing ? "fullscreen" : "sheet"}
      onClose={() => setBrowsing(false)}
    >
      {climb ? (
        <>
          <PageTitle size="sm" className="mb-3 text-foreground">
            {climb.name}
          </PageTitle>
          <JournalEntryForm
            onSave={onSave}
            onPendingChange={setPending}
            kind="session"
            climb={climb}
            hasPriorSend={sentClimbIds?.has(climb.id) ?? false}
            onDone={state.close}
          />
        </>
      ) : (
        <JournalEntryComposer
          onSave={onSave}
          sentClimbIds={sentClimbIds}
          onDone={state.close}
          onPendingChange={setPending}
          onBrowseChange={setBrowsing}
        />
      )}
    </ResponsiveDialog>
  );
}
