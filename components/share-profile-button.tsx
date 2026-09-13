"use client";

import { Button, Tooltip } from "@heroui/react";
import { Check, Share } from "lucide-react";
import { useEffect, useState } from "react";

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
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={label}
          onPress={handlePress}
          className="shrink-0 text-muted hover:text-foreground pointer-coarse:size-11"
        >
          {message === COPIED ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Share aria-hidden="true" className="size-4" />
          )}
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
