"use client";

import { Button } from "@heroui/react";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

import { ClimbPicker } from "@/components/climb-picker";
import { PageTitle } from "@/components/ui/typography";
import type { ClimbWithAreaName } from "@/db/queries";

export type EntryKindChoice =
  | { kind: "session"; climb: ClimbWithAreaName; hasPriorSend: boolean }
  | { kind: "training" };

const TRAINING_DESCRIPTION = "Indoor climbing, strength, or conditioning.";

const ENTRY_TYPES = [
  { id: "session", label: "Outdoor session", description: "One climb, sent or not." },
  { id: "training", label: "Training", description: TRAINING_DESCRIPTION },
] as const;

export function EntryKindStep({
  sentClimbIds,
  onChoose,
}: {
  sentClimbIds?: Set<number>;
  onChoose: (choice: EntryKindChoice) => void;
}) {
  const [choosingClimb, setChoosingClimb] = useState(false);

  if (choosingClimb) {
    return (
      <div className="flex flex-col gap-5">
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onPress={() => setChoosingClimb(false)}
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back
        </Button>
        <div className="flex flex-col gap-1">
          <PageTitle className="text-2xl! text-foreground">Choose a climb</PageTitle>
          <p className="text-sm text-muted">
            Log one climb at a time. You can record another entry for each climb you worked on.
          </p>
        </div>
        <ClimbPicker
          showFilters={false}
          allowSentClimbs
          onPick={(climb, context) =>
            onChoose({ kind: "session", climb, hasPriorSend: context.sent })
          }
          sentClimbIds={sentClimbIds}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <PageTitle className="text-foreground">What are you logging?</PageTitle>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {ENTRY_TYPES.map((choice) => (
          <Button
            key={choice.id}
            type="button"
            onPress={() =>
              choice.id === "session" ? setChoosingClimb(true) : onChoose({ kind: "training" })
            }
            fullWidth
            variant="outline"
            className="h-auto min-h-16 min-w-0 flex-col items-start justify-start rounded-panel! px-3 py-3 text-left whitespace-normal"
          >
            <span className="block font-medium text-foreground">{choice.label}</span>
            <span className="mt-1 block text-sm font-normal text-muted">{choice.description}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
