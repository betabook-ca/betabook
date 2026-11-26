"use client";

import { Button, useOverlayState } from "@heroui/react";
import { CirclePlus } from "lucide-react";

import { JournalEntryDrawer } from "@/components/journal/journal-entry-drawer";
import type { SendableClimb } from "@/db/queries";

const INDICATOR_BOX_CLASS = "flex size-9 shrink-0 items-center justify-center md:size-8";

export function ClimbSentIndicator({
  climb,
  sent,
}: {
  climb: SendableClimb & { name: string };
  sent: boolean;
}) {
  const state = useOverlayState();

  return (
    <>
      <span className={INDICATOR_BOX_CLASS}>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={sent ? "Log another session" : "Log entry"}
          onPress={state.open}
          className="shrink-0"
        >
          {sent ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5 text-success-soft-foreground"
              aria-hidden
            >
              <path
                d="M4 13l5 5L20 6"
                strokeDasharray={24}
                className="motion-safe:animate-tick-draw"
              />
            </svg>
          ) : (
            <CirclePlus className="size-5" />
          )}
        </Button>
      </span>
      <JournalEntryDrawer
        climb={climb}
        sentClimbIds={sent ? new Set([climb.id]) : undefined}
        state={state}
      />
    </>
  );
}
