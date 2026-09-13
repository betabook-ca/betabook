"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { ClimbPicker } from "@/components/climb-picker";
import { cardClass } from "@/components/ui/card";
import type { ClimbWithAreaName } from "@/db/queries";

export type EntryKindChoice =
  | { kind: "session"; climb: ClimbWithAreaName; hasPriorSend: boolean }
  | { kind: "training" };

export const TRAINING_DESCRIPTION = "Indoor climbing, strength, or conditioning.";

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
        <p className="font-medium text-foreground">Choose a climb</p>
        <ClimbPicker
          showFilters={false}
          allowSentClimbs
          onPick={(climb, context) =>
            onChoose({ kind: "session", climb, hasPriorSend: context.sent })
          }
          sentClimbIds={sentClimbIds}
        />
        <Button size="sm" variant="ghost" onPress={() => setChoosingClimb(false)}>
          Back to entry type
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="font-medium text-foreground">What are you logging?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ENTRY_TYPES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            onClick={() =>
              choice.id === "session" ? setChoosingClimb(true) : onChoose({ kind: "training" })
            }
            className={`cursor-pointer text-left transition-colors hover:bg-surface-secondary/60 focus-visible:status-focused ${cardClass("sm", "bordered")}`}
          >
            <span className="block font-medium text-foreground">{choice.label}</span>
            <span className="mt-1 block text-sm text-muted">{choice.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
