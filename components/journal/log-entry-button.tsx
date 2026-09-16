"use client";

import { Button, useOverlayState } from "@heroui/react";
import { CirclePlus } from "lucide-react";

import { DeferredLoadError } from "@/components/ui/deferred-load-error";
import type { SendableClimb } from "@/db/queries";
import { useDeferredComponent } from "@/hooks/use-deferred-component";

/** Module-level so its identity is stable across renders — the preload hook
 * keys its effect on the loader. The composer stays out of the app header's bundle. */
const loadDrawer = () =>
  import("@/components/journal/journal-entry-drawer").then((m) => m.JournalEntryDrawer);

export function LogEntryButton({
  climb,
  sentClimbIds,
  label = "Log",
  variant,
  size,
  className = "",
}: {
  climb?: SendableClimb & { name: string };
  sentClimbIds?: Set<number>;
  label?: string;
  variant?: "outline";
  size?: "sm";
  className?: string;
}) {
  const state = useOverlayState();
  const { Component: JournalEntryDrawer, load, failed } = useDeferredComponent(loadDrawer);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onPress={() => {
          load();
          state.open();
        }}
        className={`gap-2 ${className}`}
      >
        <CirclePlus className={size === "sm" ? "size-4" : "size-5"} />
        {label}
      </Button>
      {JournalEntryDrawer && (
        <JournalEntryDrawer climb={climb} sentClimbIds={sentClimbIds} state={state} />
      )}
      {state.isOpen && failed && (
        <DeferredLoadError feature="the entry form" onRetry={load} onDismiss={state.close} />
      )}
    </>
  );
}
