"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useMemo, useState, useTransition } from "react";

import { pinProject } from "@/actions";
import { ClimbPicker } from "@/components/climb-picker";
import { ProjectSuggestionList } from "@/components/journal/project-suggestion-list";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { OpenProject } from "@/db/queries";
import { useCompactViewport } from "@/hooks/use-compact-viewport";

type PinProjectDialogProps = {
  state: UseOverlayStateReturn;
  /** Climbs worked but never sent, offered before the climber searches. */
  suggestions: readonly OpenProject[];
  /** Already pinned, so the picker can say so instead of failing the pin. */
  pinnedClimbIds: readonly number[];
};

/** Fullscreen: with the keyboard up, a sheet would show about three results. */
export function PinProjectDialog({ state, suggestions, pinnedClimbIds }: PinProjectDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingClimbId, setPendingClimbId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const compact = useCompactViewport();

  const disabledClimbIds = useMemo(
    () => new Map(pinnedClimbIds.map((id) => [id, "Already tracked"] as const)),
    [pinnedClimbIds],
  );

  function handlePin(climbId: number) {
    if (pending) return;
    setError(null);
    setPendingClimbId(climbId);
    startTransition(async () => {
      const result = await pinProject(climbId);
      setPendingClimbId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      state.close();
    });
  }

  function reset() {
    setError(null);
    setPendingClimbId(null);
  }

  return (
    <ResponsiveDialog
      state={state}
      title="Track a project"
      size="lg"
      presentation="fullscreen"
      isPending={pending}
      onClose={reset}
    >
      <div className="flex flex-col gap-3">
        <ClimbPicker
          allowSentClimbs
          showFilters={!compact}
          disabledClimbIds={disabledClimbIds}
          emptyQuerySlot={
            <ProjectSuggestionList
              suggestions={suggestions}
              pendingClimbId={pendingClimbId}
              onPin={(climb) => handlePin(climb.climbId)}
            />
          }
          onPick={(climb) => handlePin(climb.id)}
        />
        {error && <InlineAlert>{error}</InlineAlert>}
        {pending && <p className="text-sm text-muted">Tracking…</p>}
      </div>
    </ResponsiveDialog>
  );
}
