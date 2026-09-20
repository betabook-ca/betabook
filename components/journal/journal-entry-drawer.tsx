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

/** Logging an entry — the thing this app is for, and the overlay opened
 * most often from a phone at a crag. A sheet puts the form under the thumb
 * and resizes against the keyboard; the same dialog centers itself once
 * there is a mouse and a wide screen. */
export function JournalEntryDrawer({
  climb,
  sentClimbIds,
  state,
  onSave,
}: JournalEntryDrawerProps) {
  const [pending, setPending] = useState(false);
  return (
    <ResponsiveDialog state={state} title="Log entry" hideTitle isPending={pending}>
      {climb ? (
        <>
          <PageTitle className="mb-3 text-2xl! text-foreground">{climb.name}</PageTitle>
          <JournalEntryForm
            onSave={onSave}
            embedded
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
        />
      )}
    </ResponsiveDialog>
  );
}
