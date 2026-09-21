"use client";

import { Button } from "@heroui/react";
import { Target } from "lucide-react";

import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Grade } from "@/components/ui/grade";
import type { OpenProject } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { formatGrade } from "@/lib/grades";

/** Climbs the climber has worked but never sent, offered before they type.
 * The session count is the whole reason a row is here — it is the evidence
 * that this climb is already being projected, whether or not it was pinned. */
export function ProjectSuggestionList({
  suggestions,
  onPin,
  pendingClimbId,
}: {
  suggestions: readonly OpenProject[];
  onPin: (climb: OpenProject) => void;
  pendingClimbId: number | null;
}) {
  if (suggestions.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted">Recommended projects</h3>
      <ul aria-label="Suggested projects" className="flex flex-col gap-1.5">
        {suggestions.map((climb) => (
          <li key={climb.climbId}>
            <Button
              variant="ghost"
              className="h-auto w-full justify-between gap-3 px-3 py-2 text-left"
              isDisabled={pendingClimbId != null}
              aria-label={`Track ${climb.climbName}`}
              onPress={() => onPin(climb)}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{climb.climbName}</span>
                <span className="truncate text-sm text-muted">
                  {climb.areaName} · {formatCount(climb.sessionCount, "session")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Grade size="sm">{formatGrade(climb.climbType, climb.climbGrade)}</Grade>
                <DisciplineChip type={climb.climbType} />
                <Target className="size-4" />
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
