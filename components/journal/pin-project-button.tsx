"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Pin } from "lucide-react";

import { DeferredLoadError } from "@/components/ui/deferred-load-error";
import type { OpenProject } from "@/db/queries";
import { useDeferredComponent } from "@/hooks/use-deferred-component";

/** Module-level so its identity is stable across renders — the preload hook
 * keys its effect on the loader. Keeps the climb search out of the page bundle. */
const loadDrawer = () =>
  import("@/components/journal/pin-project-drawer").then((m) => m.PinProjectDrawer);

export function PinProjectButton({
  suggestions,
  pinnedClimbIds,
}: {
  suggestions: readonly OpenProject[];
  pinnedClimbIds: readonly number[];
}) {
  const state = useOverlayState();
  const { Component: PinProjectDrawer, load, failed } = useDeferredComponent(loadDrawer);

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
        Pin project
      </Button>
      {PinProjectDrawer && (
        <PinProjectDrawer state={state} suggestions={suggestions} pinnedClimbIds={pinnedClimbIds} />
      )}
      {state.isOpen && failed && (
        <DeferredLoadError feature="the climb search" onRetry={load} onDismiss={state.close} />
      )}
    </>
  );
}
