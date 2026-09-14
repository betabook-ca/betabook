"use client";

import { Button } from "@heroui/react";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

import { EntryKindStep, type EntryKindChoice } from "@/components/journal/entry-kind-step";
import type { JournalEntryFieldsProps } from "@/components/journal/journal-entry-fields";
import { JournalEntryForm } from "@/components/journal/journal-entry-form";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Grade } from "@/components/ui/grade";
import { PageTitle } from "@/components/ui/typography";
import type { ClimbWithAreaName } from "@/db/queries";
import { formatGrade } from "@/lib/grades";

function ChosenStrip({
  choice,
  onChange,
  pending,
}: {
  choice: EntryKindChoice;
  onChange: () => void;
  pending: boolean;
}) {
  const climb = choice.kind === "session" ? choice.climb : undefined;

  return (
    <div className="flex flex-col gap-3">
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onPress={onChange}
        isDisabled={pending}
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <PageTitle className="text-2xl! text-foreground">
            {climb ? climb.name : "Training"}
          </PageTitle>
          {climb && <p className="text-xs text-muted">{climb.areaName}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {climb && (
            <>
              <DisciplineChip type={climb.type} />
              <Grade>{formatGrade(climb.type, climb.grade)}</Grade>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function JournalEntryComposer({
  sentClimbIds,
  onDone,
  onPendingChange,
  onSave,
}: {
  sentClimbIds?: Set<number>;
  onDone: () => void;
  onPendingChange?: (pending: boolean) => void;
  onSave?: JournalEntryFieldsProps["onSave"];
}) {
  const [pending, setPending] = useState(false);
  const [choice, setChoice] = useState<EntryKindChoice | null>(null);

  if (!choice) {
    return <EntryKindStep sentClimbIds={sentClimbIds} onChoose={setChoice} />;
  }

  const climb: ClimbWithAreaName | undefined = choice.kind === "session" ? choice.climb : undefined;

  return (
    <div className="flex flex-col gap-4">
      <ChosenStrip choice={choice} onChange={() => setChoice(null)} pending={pending} />
      <JournalEntryForm
        onSave={onSave}
        embedded
        kind={choice.kind}
        climb={climb}
        hasPriorSend={choice.kind === "session" ? choice.hasPriorSend : false}
        onDone={onDone}
        onPendingChange={(value) => {
          setPending(value);
          onPendingChange?.(value);
        }}
      />
    </div>
  );
}
