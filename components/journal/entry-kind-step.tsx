"use client";

import { Button } from "@heroui/react";
import { ArrowLeft } from "lucide-react";

import { ClimbPicker } from "@/components/climb-picker";
import { ActivityIcon } from "@/components/ui/activity-icon";
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
  choosingClimb,
  onChoosingClimbChange,
}: {
  sentClimbIds?: Set<number>;
  onChoose: (choice: EntryKindChoice) => void;
  /** Controlled by the composer, which passes it up to the dialog: the climb
   * search needs the whole screen on a phone, the kind picker doesn't. */
  choosingClimb: boolean;
  onChoosingClimbChange: (choosing: boolean) => void;
}) {
  if (choosingClimb) {
    return (
      // Everything above the results costs a result row. With a keyboard up
      // there are only a few to spend, so Back shares the title's row and the
      // step explains itself rather than carrying a paragraph.
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label="Back"
            onPress={() => onChoosingClimbChange(false)}
          >
            <ArrowLeft aria-hidden className="size-4" />
          </Button>
          <PageTitle size="sm" className="text-foreground">
            Choose a climb
          </PageTitle>
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
              choice.id === "session" ? onChoosingClimbChange(true) : onChoose({ kind: "training" })
            }
            fullWidth
            variant="outline"
            className="h-auto min-h-16 min-w-0 flex-col items-start justify-start rounded-panel! px-3 py-3 text-left whitespace-normal"
          >
            <span className="flex items-center gap-1 font-medium text-foreground">
              <ActivityIcon kind={choice.id} />
              {choice.label}
            </span>
            <span className="mt-1 block text-sm font-normal text-muted">{choice.description}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
