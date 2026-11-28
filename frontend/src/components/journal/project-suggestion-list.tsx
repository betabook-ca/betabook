"use client";

import { Button } from "@heroui/react";
import { Target } from "lucide-react";

import { DisciplineChip } from "@/components/climbing/discipline-chip";
import { Grade } from "@/components/climbing/grade";
import { GradeLabel } from "@/components/climbing/grade-label";
import { Eyebrow } from "@/components/ui/eyebrow";
import { formatCount } from "@/lib/format";
import type { OpenProject } from "@/lib/logbook-types";

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
      <Eyebrow as="h3">Recommended projects</Eyebrow>
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
                <Grade size="sm">
                  <GradeLabel type={climb.climbType} grade={climb.climbGrade} />
                </Grade>
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
