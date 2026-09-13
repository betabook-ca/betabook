"use client";

import { Button } from "@heroui/react";
import { Check, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { openShareSheet, useNativeShare } from "@/hooks/use-native-share";
import { SITE_NAME } from "@/lib/site";

const COPIED = "Profile link copied";

export function ShareProfileButton({ name, url }: { name: string; url: string }) {
  const [message, setMessage] = useState("");
  const nativeShare = useNativeShare();

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 3000);
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
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="outline" onPress={handlePress} className="gap-2">
        {message === COPIED ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Share aria-hidden="true" className="size-4" />
        )}
        {nativeShare ? "Share profile" : "Copy profile link"}
      </Button>
      <span role="status" className="text-xs text-muted empty:sr-only">
        {message}
      </span>
    </div>
  );
}
