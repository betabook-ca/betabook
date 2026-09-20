"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Pin } from "lucide-react";

import { DeferredLoadError } from "@/components/ui/deferred-load-error";
import type { OpenProject } from "@/db/queries";
import { useDeferredComponent } from "@/hooks/use-deferred-component";

/** Module-level so its identity is stable across renders — the preload hook
 * keys its effect on the loader. Keeps the climb search out of the page bundle. */
const loadDialog = () =>
  import("@/components/journal/pin-project-dialog").then((m) => m.PinProjectDialog);

export function PinProjectButton({
  suggestions,
  pinnedClimbIds,
}: {
  suggestions: readonly OpenProject[];
  pinnedClimbIds: readonly number[];
}) {
  const state = useOverlayState();
  const { Component: PinProjectDialog, load, failed } = useDeferredComponent(loadDialog);

  return (
    <>
      <Button
        size="sm"
        className="gap-1.5"
        onPress={() => {
          load();
          state.open();
        }}
      >
        <Pin className="size-4" />
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
