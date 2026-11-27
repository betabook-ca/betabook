"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Target } from "lucide-react";

import { DeferredLoadError } from "@/components/ui/deferred-load-error";
import { useDeferredComponent } from "@/hooks/use-deferred-component";
import type { OpenProject } from "@/lib/logbook-types";

/** Module-level so its identity is stable across renders — the preload hook
 * keys its effect on the loader. Keeps the climb search out of the page bundle. */
const loadDialog = () =>
  import("@/components/journal/pin-project-dialog").then((m) => m.PinProjectDialog);

export function PinProjectButton({
  isDisabled = false,
  suggestions,
  pinnedClimbIds,
}: {
  isDisabled?: boolean;
  suggestions: readonly OpenProject[];
  pinnedClimbIds: readonly number[];
}) {
  const state = useOverlayState();
  const { Component: PinProjectDialog, load, failed } = useDeferredComponent(loadDialog);

  return (
    <>
      <Button
        isDisabled={isDisabled}
        size="sm"
        className="gap-1.5"
        onPress={() => {
          load();
          state.open();
        }}
      >
        <Target className="size-4" />
        Track project
      </Button>
      {PinProjectDialog && (
        <PinProjectDialog state={state} suggestions={suggestions} pinnedClimbIds={pinnedClimbIds} />
      )}
      {state.isOpen && failed && (
        <DeferredLoadError feature="the climb search" onRetry={load} onDismiss={state.close} />
      )}
    </>
  );
}
