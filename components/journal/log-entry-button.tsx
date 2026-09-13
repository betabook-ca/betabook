"use client";

import { Button, useOverlayState } from "@heroui/react";
import { clsx } from "clsx";
import { CirclePlus } from "lucide-react";

import { JournalEntryDrawer } from "@/components/journal/journal-entry-drawer";
import type { SendableClimb } from "@/db/queries";

type LogEntryButtonProps = {
  climb?: SendableClimb & { name: string };
  sentClimbIds?: Set<number>;
  fullWidth?: boolean;
  label?: string;
  variant?: "outline";
  className?: string;
};

export function LogEntryButton({
  climb,
  sentClimbIds,
  fullWidth,
  label = "Log",
  variant,
  className,
}: LogEntryButtonProps) {
  const state = useOverlayState();

  return (
    <>
      <Button
        variant={variant}
        fullWidth={fullWidth}
        onPress={state.open}
        className={clsx("gap-2", className)}
      >
        <CirclePlus className="size-5" />
        {label}
      </Button>
      <JournalEntryDrawer climb={climb} sentClimbIds={sentClimbIds} state={state} />
    </>
  );
}
