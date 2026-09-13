"use client";

import { Drawer } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";

import { JournalEntryForm } from "@/components/journal/journal-entry-form";
import { SendEditor } from "@/components/send-editor";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import type { JournalEntry } from "@/db/queries";

export function JournalEntryEditDrawer({
  entry,
  state,
}: {
  entry: JournalEntry;
  state: UseOverlayStateReturn;
}) {
  return (
    <Drawer.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Drawer.Content>
        <Drawer.Dialog className={`mx-auto w-full ${PAGE_MAX_WIDTH_CLASS}`}>
          <Drawer.Header>
            <Drawer.Heading>{entry.isAscent ? "Edit send" : "Edit entry"}</Drawer.Heading>
            <Drawer.CloseTrigger />
          </Drawer.Header>
          <Drawer.Body>
            {state.isOpen &&
              (entry.isAscent ? (
                <SendEditor entryId={entry.id} onDone={state.close} />
              ) : (
                <JournalEntryForm
                  kind={entry.kind}
                  climb={
                    entry.climbId != null && entry.climbType != null
                      ? {
                          id: entry.climbId,
                          name: entry.climbName ?? "",
                          type: entry.climbType,
                          grade: entry.climbGrade,
                          areaId: entry.areaId ?? 0,
                        }
                      : null
                  }
                  existingEntry={entry}
                  onDone={state.close}
                />
              ))}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
