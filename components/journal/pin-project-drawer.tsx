"use client";

import { Drawer } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useMemo, useState, useTransition } from "react";

import { pinProject } from "@/actions";
import { ClimbPicker } from "@/components/climb-picker";
import { ProjectSuggestionList } from "@/components/journal/project-suggestion-list";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import type { OpenProject } from "@/db/queries";

type PinProjectDrawerProps = {
  state: UseOverlayStateReturn;
  /** Climbs worked but never sent, offered before the climber searches. */
  suggestions: readonly OpenProject[];
  /** Already pinned, so the picker can say so instead of failing the pin. */
  pinnedClimbIds: readonly number[];
};

/** Picks a climb to track as a project. A drawer rather than a centered
 * dialog because the body is a search surface, not a yes/no question. */
export function PinProjectDrawer({ state, suggestions, pinnedClimbIds }: PinProjectDrawerProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingClimbId, setPendingClimbId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

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
        // Keep the drawer open so the climber can pick something else.
        setError(result.error);
        return;
      }
      state.close();
    });
  }

  function handleOpenChange(isOpen: boolean) {
    state.setOpen(isOpen);
    if (!isOpen) {
      setError(null);
      setPendingClimbId(null);
    }
  }

  return (
    <Drawer.Backdrop isOpen={state.isOpen} onOpenChange={handleOpenChange}>
      <Drawer.Content>
        <Drawer.Dialog className={`mx-auto w-full ${PAGE_MAX_WIDTH_CLASS}`}>
          <Drawer.Header>
            <Drawer.Heading>Pin a project</Drawer.Heading>
            <Drawer.CloseTrigger />
          </Drawer.Header>
          <Drawer.Body>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                Pinned climbs are the only ones on your Projects tabs. Pin one you haven&apos;t
                touched yet and it waits there for your first session.
              </p>
              <ClimbPicker
                allowSentClimbs
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
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
