"use client";

import { Button, Tooltip, useMediaQuery } from "@heroui/react";
import { Check, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { openShareSheet, useNativeShare } from "@/hooks/use-share-link";
import { SITE_NAME } from "@/lib/site";

const COPIED = "Profile link copied";

export function ShareProfileButton({ name, url }: { name: string; url: string }) {
  const [message, setMessage] = useState("");
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 640px)", { initializeWithValue: false });
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
    if (nativeShare) {
      try {
        await openShareSheet({ title: `${name} on ${SITE_NAME}`, url });
        return;
      } catch {
        // A share sheet that fails to open falls back to copying.
      }
    }
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
        <Button isIconOnly variant="ghost" aria-label={label} onPress={handlePress}>
          {message === COPIED ? (
            <Check aria-hidden="true" className="size-5" />
          ) : (
            <Share aria-hidden="true" className="size-5" />
          )}
        </Button>
        <Tooltip.Content placement={desktop ? "bottom end" : "right"} offset={8}>
          {message || label}
        </Tooltip.Content>
      </Tooltip.Root>
      <span role="status" className="sr-only">
        {message}
      </span>
    </>
  );
}
