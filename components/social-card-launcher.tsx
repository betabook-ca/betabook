"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Share } from "lucide-react";

import { SocialCardDialog } from "@/components/social-card-dialog";

/** Entry point for the owner's shareable recap card, beside Customize on the
 * analytics page. Split from the dialog so opening it doesn't pull the
 * dialog's own state into this always-mounted button. */
export function SocialCardLauncher({ userId, name }: { userId: string; name: string }) {
  const state = useOverlayState();
  return (
    <>
      <Button variant="outline" size="sm" onPress={state.open}>
        <Share aria-hidden="true" size={16} />
        Share stats
      </Button>
      <SocialCardDialog state={state} userId={userId} name={name} />
    </>
  );
}
