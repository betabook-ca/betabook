"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useState } from "react";

import { JournalEntryForm } from "@/components/journal/journal-entry-form";
import { SendEditor } from "@/components/send-editor";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { PageTitle } from "@/components/ui/typography";
import type { JournalEntry } from "@/db/queries";

function editTitle(entry: JournalEntry): string {
  if (entry.isAscent) return "Edit send";
  return entry.kind === "training" ? "Edit training" : "Edit session";
}

/** Sends use SendEditor; sessions and training use the journal form. */
export function JournalEntryEditDrawer({
  entry,
  state,
}: {
  entry: JournalEntry;
  state: UseOverlayStateReturn;
}) {
  const [pending, setPending] = useState(false);
  const title = editTitle(entry);

  return (
    <ResponsiveDialog
      state={state}
      title={title}
      // Session and training bodies start with their own page title. The
      // send editor has no heading, so it keeps the dialog's.
      hideTitle={!entry.isAscent}
      isPending={pending}
    >
      {entry.isAscent ? (
        <SendEditor entryId={entry.id} onDone={state.close} />
      ) : (
        <>
          <PageTitle className="mb-3 text-2xl! text-foreground">{title}</PageTitle>
          <JournalEntryForm
            onPendingChange={setPending}
            kind={entry.kind}
            climb={
              entry.climbId != null && entry.climbType != null
                ? {
                    id: entry.climbId,
                    name: entry.climbName ?? "",
                    type: entry.climbType,
                    grade: entry.climbGrade,
                    brokenOn: entry.climbBrokenOn,
                    areaId: entry.areaId ?? 0,
                  }
                : null
            }
            existingEntry={entry}
            onDone={state.close}
          />
        </>
      )}
    </ResponsiveDialog>
  );
}
