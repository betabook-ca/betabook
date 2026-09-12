"use client";

import { Drawer, Modal } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useState } from "react";

import { JournalEntryForm } from "@/components/journal/journal-entry-form";
import { SendEditor } from "@/components/send-editor";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { PageTitle } from "@/components/ui/typography";
import type { JournalEntry } from "@/db/queries";

export function JournalEntryEditDrawer({
  entry,
  state,
}: {
  entry: JournalEntry;
  state: UseOverlayStateReturn;
}) {
  const [pending, setPending] = useState(false);
  if (!entry.isAscent) {
    const title = entry.kind === "training" ? "Edit training" : "Edit session";
    return (
      <Modal.Backdrop
        isOpen={state.isOpen}
        onOpenChange={(open) => {
          if (!pending) state.setOpen(open);
        }}
      >
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog aria-label={title} className="w-full max-w-lg">
            <Modal.Header>
              <Modal.Heading className="sr-only">{title}</Modal.Heading>
              <Modal.CloseTrigger isDisabled={pending} />
            </Modal.Header>
            <Modal.Body>
              {state.isOpen && (
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
                            areaId: entry.areaId ?? 0,
                          }
                        : null
                    }
                    existingEntry={entry}
                    onDone={state.close}
                  />
                </>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    );
  }
  return (
    <Drawer.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Drawer.Content>
        <Drawer.Dialog className={`mx-auto w-full ${PAGE_MAX_WIDTH_CLASS}`}>
          <Drawer.Header>
            <Drawer.Heading>Edit send</Drawer.Heading>
            <Drawer.CloseTrigger />
          </Drawer.Header>
          <Drawer.Body>
            {state.isOpen && <SendEditor entryId={entry.id} onDone={state.close} />}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
