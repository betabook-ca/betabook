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

/** Editing one journal entry, whichever kind it is.
 *
 * An ascent and a session are the same row in the same list, reached by the
 * same Edit item in the same menu — so they get the same surface. They used
 * to split here, a centered modal for one and a bottom sheet for the other,
 * which made the chrome depend on a property of the entry the viewer never
 * chose. Only the body differs now: a send has its own editor. */
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
      // The session and training bodies lead with the same words as a page
      // title; the send editor has no heading of its own, so it keeps the
      // dialog's.
      hideTitle={!entry.isAscent}
      isPending={pending}
    >
      {entry.isAscent ? (
        <SendEditor entryId={entry.id} onDone={state.close} />
      ) : (
        <>
          <PageTitle className="mb-3 text-2xl! text-foreground">{title}</PageTitle>
          <JournalEntryForm
            embedded
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
