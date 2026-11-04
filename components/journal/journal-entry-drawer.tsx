"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useState } from "react";

import { DayLogComposer } from "@/components/journal/day-log-composer";
import type { DaySeed } from "@/components/journal/day-log-entry";
import { JournalEntryComposer } from "@/components/journal/journal-entry-composer";
import type { JournalEntryFieldsProps } from "@/components/journal/journal-entry-fields";
import { JournalEntryForm } from "@/components/journal/journal-entry-form";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { PageTitle } from "@/components/ui/typography";
import type { SendableClimb } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";

type JournalEntryDrawerProps = {
  climb?: SendableClimb & { name: string };
  sentClimbIds?: Set<number>;
  state: UseOverlayStateReturn;
  onSave?: JournalEntryFieldsProps["onSave"];
  onSaveDay?: (formData: FormData) => Promise<ActionResult>;
};

/** Logging an entry. This is the overlay opened most often, usually from a
 * phone, so it's a sheet there — the form stays near the thumb and resizes
 * against the keyboard. On desktop it centers like every other dialog.
 *
 * An outdoor session's Log additional climbs turns it into a day: the same
 * dialog then holds the day's form, starting from that session. */
export function JournalEntryDrawer({
  climb,
  sentClimbIds,
  state,
  onSave,
  onSaveDay,
}: JournalEntryDrawerProps) {
  const [pending, setPending] = useState(false);
  // The climb search is a search field over a result list, which wants the
  // whole phone screen rather than a sheet's 85vh — with a keyboard up the
  // sheet caps after about two results. Only the presentation changes, so
  // the picker keeps its query and results across the switch. A day is a
  // list of climbs, so it takes the whole screen too.
  const [browsing, setBrowsing] = useState(false);
  const [day, setDay] = useState<DaySeed | null>(null);
  return (
    <ResponsiveDialog
      state={state}
      title="Log entry"
      hideTitle
      isPending={pending}
      presentation={browsing || day ? "fullscreen" : "sheet"}
      onClose={() => {
        setBrowsing(false);
        setDay(null);
      }}
    >
      {day ? (
        <DayLogComposer
          seed={day}
          focusOnOpen
          sentClimbIds={sentClimbIds}
          onDone={state.close}
          onPendingChange={setPending}
          onSave={onSaveDay}
        />
      ) : climb ? (
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
            onLogMore={setDay}
          />
        </>
      ) : (
        <JournalEntryComposer
          onSave={onSave}
          sentClimbIds={sentClimbIds}
          onDone={state.close}
          onPendingChange={setPending}
          onBrowseChange={setBrowsing}
          onLogMore={(seed) => {
            setBrowsing(false);
            setDay(seed);
          }}
        />
      )}
    </ResponsiveDialog>
  );
}
