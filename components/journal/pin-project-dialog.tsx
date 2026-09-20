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

/** Picks a climb to track as a project: a task, so it takes the shared
 * dialog — full screen on a phone, a centered column from `md` up.
 *
 * Fullscreen because the body is a search field over a result list, the same
 * reason the log entry's climb picker takes the screen: at 85vh with a
 * keyboard up a sheet caps the list around three results. The compact rule
 * applies on top of it, since the viewport is just as short either way — the
 * explanation and the full filter row go first, because each costs a result. */
export function PinProjectDialog({ state, suggestions, pinnedClimbIds }: PinProjectDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingClimbId, setPendingClimbId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const compact = useCompactViewport();

  const disabledClimbIds = useMemo(
    () => new Map(pinnedClimbIds.map((id) => [id, "Already pinned"] as const)),
    [pinnedClimbIds],
  );

  function handlePin(climbId: number) {
    // Picking is a single click — ignore further picks while one is in flight.
    if (pending) return;
    setError(null);
    setPendingClimbId(climbId);
    startTransition(async () => {
      const result = await pinProject(climbId);
      setPendingClimbId(null);
      if (!result.ok) {
        // Keep the dialog open so the climber can pick something else.
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
      title="Pin a project"
      size="lg"
      presentation="fullscreen"
      isPending={pending}
      onClose={reset}
    >
      <div className="flex flex-col gap-3">
        {!compact && (
          <p className="text-sm text-muted">
            Pinned climbs are the only ones on your Projects tabs. Pin one you haven&apos;t touched
            yet and it waits there for your first session.
          </p>
        )}
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
        {pending && <p className="text-sm text-muted">Pinning…</p>}
      </div>
    </ResponsiveDialog>
  );
}
