"use client";

import { Button, useOverlayState } from "@heroui/react";
import { clsx } from "clsx";
import { CirclePlus } from "lucide-react";

import type { SendableClimb } from "@/db/queries";
import { useDeferredComponent } from "@/hooks/use-deferred-component";

/** Module-level so its identity is stable across renders — the preload hook
 * keys its effect on the loader. The composer stays out of the app header's bundle. */
const loadDrawer = () =>
  import("@/components/journal/journal-entry-drawer").then((m) => m.JournalEntryDrawer);

type LogEntryButtonProps = {
  climb?: SendableClimb & { name: string };
  sentClimbIds?: Set<number>;
  fullWidth?: boolean;
  label?: string;
  variant?: "outline";
  size?: "sm";
  className?: string;
};

export function LogEntryButton({
  climb,
  sentClimbIds,
  fullWidth,
  label = "Log",
  variant,
  size,
  className,
}: LogEntryButtonProps) {
  const state = useOverlayState();
  const { Component: JournalEntryDrawer, load } = useDeferredComponent(loadDrawer);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        onPress={() => {
          load();
          state.open();
        }}
        className={clsx("gap-2", className)}
      >
        <CirclePlus className={size === "sm" ? "size-4" : "size-5"} />
        {label}
      </Button>
      {JournalEntryDrawer && (
        <JournalEntryDrawer climb={climb} sentClimbIds={sentClimbIds} state={state} />
      )}
    </>
  );
}
