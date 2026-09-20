"use client";

import { Button, Description, Input, Label, TextField } from "@heroui/react";
import { Copy, Share } from "lucide-react";
import { useState, type ReactNode } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { openShareSheet, useNativeShare } from "@/hooks/use-native-share";

/** A link the user is meant to hand to someone, with the two ways of handing
 * it over that always apply: the clipboard, and the platform share sheet where
 * there is one.
 *
 * The field is read-only and selects itself on focus, because the fallback
 * when the clipboard is refused is "select it and copy it yourself" — so that
 * has to be one gesture. Anything specific to a particular link (a QR code, a
 * reset, a revoke) goes in `actions`, which sits beside the two buttons. */
export function ShareLinkField({
  label,
  url,
  description,
  shareTitle,
  actions,
  notice,
  error: externalError,
}: {
  label: string;
  url: string;
  description?: ReactNode;
  /** Title offered to the platform share sheet. */
  shareTitle: string;
  actions?: ReactNode;
  /** Announced beside the copy/share outcome, so a caller's own result — a
   * link reset, a link created — shares the one live region rather than
   * adding a second one for a screen reader to find. */
  notice?: string;
  error?: string | null;
}) {
  const nativeShare = useNativeShare();
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  function report(nextStatus: string, nextError: string | null = null) {
    setStatus(nextStatus);
    setError(nextError);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      report("Link copied");
    } catch {
      report("", "Couldn't copy the link. Select it and copy it instead.");
    }
  }

  async function share() {
    try {
      await openShareSheet({ title: shareTitle, url });
      report("");
    } catch {
      report("", "Couldn't open sharing. Copy the link instead.");
    }
  }

  // A fresh outcome from either side replaces the other: they describe the
  // same link, and two stale sentences stacked up read as a list of problems.
  const shownStatus = status || (notice ?? "");
  const shownError = error ?? externalError ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TextField value={url} isReadOnly>
        <Label>{label}</Label>
        <Input onFocus={(event) => event.currentTarget.select()} />
        {description && <Description className="text-sm">{description}</Description>}
      </TextField>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onPress={copy}>
          <Copy aria-hidden="true" className="size-4" />
          Copy link
        </Button>
        {nativeShare && (
          <Button variant="outline" onPress={share}>
            <Share aria-hidden="true" className="size-4" />
            Share link
          </Button>
        )}
        {actions}
      </div>
      <p role="status" className="text-sm text-muted empty:sr-only">
        {shownStatus}
      </p>
      {shownError && <InlineAlert>{shownError}</InlineAlert>}
    </div>
  );
}
