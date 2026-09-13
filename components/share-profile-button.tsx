"use client";

import { Button, Tooltip } from "@heroui/react";
import { clsx } from "clsx";
import { Check, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { PROFILE_ACTION_CLASS, PROFILE_ACTION_LABEL_CLASS } from "@/components/profile-actions";
import { openShareSheet, useNativeShare } from "@/hooks/use-native-share";
import { SITE_NAME } from "@/lib/site";

const COPIED = "Profile link copied";

export function ShareProfileButton({ name, url }: { name: string; url: string }) {
  const [message, setMessage] = useState("");
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const nativeShare = useNativeShare();
  const label = nativeShare ? "Share profile" : "Copy profile link";

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => {
      setTooltipOpen(false);
      setMessage("");
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  async function handlePress() {
    const shared =
      nativeShare &&
      (await openShareSheet({ title: `${name} on ${SITE_NAME}`, url }).then(
        () => true,
        () => false,
      ));
    if (shared) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage(COPIED);
    } catch {
      setMessage("Couldn't copy the link. Try again.");
    }
    setTooltipOpen(true);
  }

  return (
    <>
      <Tooltip.Root isOpen={tooltipOpen} onOpenChange={setTooltipOpen}>
        <Button
          variant="outline"
          onPress={handlePress}
          className={clsx("gap-2 @max-4xl:aspect-square @max-4xl:px-0", PROFILE_ACTION_CLASS)}
        >
          {message === COPIED ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Share aria-hidden="true" className="size-4" />
          )}
          <span className={PROFILE_ACTION_LABEL_CLASS}>{label}</span>
        </Button>
        <Tooltip.Content placement="bottom" offset={8}>
          {message || label}
        </Tooltip.Content>
      </Tooltip.Root>
      {/* Stays mounted so the copied message is announced; the tooltip is visual only. */}
      <span role="status" className="sr-only">
        {message}
      </span>
    </>
  );
}
