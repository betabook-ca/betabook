"use client";

import { Modal } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useState } from "react";

import { JournalEntryComposer } from "@/components/journal/journal-entry-composer";
import type { JournalEntryFieldsProps } from "@/components/journal/journal-entry-fields";
import { JournalEntryForm } from "@/components/journal/journal-entry-form";
import { PageTitle } from "@/components/ui/typography";
import type { SendableClimb } from "@/db/queries";

type JournalEntryDrawerProps = {
  climb?: SendableClimb & { name: string };
  sentClimbIds?: Set<number>;
  state: UseOverlayStateReturn;
  onSave?: JournalEntryFieldsProps["onSave"];
};

export function JournalEntryDrawer({
  climb,
  sentClimbIds,
  state,
  onSave,
}: JournalEntryDrawerProps) {
  const [pending, setPending] = useState(false);
  return (
    <Modal.Backdrop
      isOpen={state.isOpen}
      onOpenChange={(open) => {
        if (!pending) state.setOpen(open);
      }}
    >
      <Modal.Container placement="center" scroll="inside">
        <Modal.Dialog aria-label="Log entry" className="w-full max-w-lg">
          <Modal.Header>
            <Modal.Heading className="sr-only">Log entry</Modal.Heading>
            <Modal.CloseTrigger isDisabled={pending} />
          </Modal.Header>
          <Modal.Body>
            {state.isOpen &&
              (climb ? (
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
              ))}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
