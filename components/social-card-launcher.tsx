"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Share } from "lucide-react";

import { SocialCardDialog } from "@/components/social-card-dialog";

/** December-only entry point for the owner's yearly recap, beside Customize
 * on Analytics. The server page decides seasonal visibility. */
export function SocialCardLauncher({
  userId,
  name,
  year,
  linkedRecapAvailable,
}: {
  userId: string;
  name: string;
  year: number;
  linkedRecapAvailable: boolean;
}) {
  const state = useOverlayState();
  return (
    <>
      <Button size="sm" onPress={state.open}>
        <Share aria-hidden="true" size={16} />
        Year in review
      </Button>
      <SocialCardDialog
        state={state}
        userId={userId}
        name={name}
        year={year}
        linkedRecapAvailable={linkedRecapAvailable}
      />
    </>
  );
}
