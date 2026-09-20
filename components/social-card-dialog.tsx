"use client";

import { AlertDialog, Button } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { Download, Share } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { openShareSheet, useNativeShare } from "@/hooks/use-native-share";
import { downloadBlob } from "@/lib/download";
import { SOCIAL_CARD_PERIODS, type SocialCardPeriod } from "@/lib/social-card";
import { fetchStatsCardImage } from "@/lib/social-card-fetch";

const PERIOD_OPTIONS = SOCIAL_CARD_PERIODS.map(({ id, label }) => ({ value: id, label }));

/** A generated card, kept alongside the blob URL that renders it so both can
 * be revoked/replaced together instead of drifting out of sync. */
type Card = { period: SocialCardPeriod; blob: Blob; url: string };
/** Scoped to the period it happened in, like `Card` — so switching to a
 * period that hasn't failed never shows a stale failure while it loads. */
type FetchError = { period: SocialCardPeriod; message: string };

export function SocialCardDialog({
  state,
  userId,
  name,
}: {
  state: UseOverlayStateReturn;
  userId: string;
  name: string;
}) {
  const nativeShare = useNativeShare();
  const [period, setPeriod] = useState<SocialCardPeriod>("year");
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<FetchError | null>(null);
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!state.isOpen) return;
    let cancelled = false;
    startTransition(async () => {
      try {
        const blob = await fetchStatsCardImage(userId, period);
        if (cancelled) return;
        // The object URL of whatever card this replaces is revoked by the
        // cleanup on the effect below, keyed off the same `card` state.
        setCard({ period, blob, url: URL.createObjectURL(blob) });
        setStatus("");
      } catch {
        if (!cancelled) setError({ period, message: "Couldn't generate your card. Try again." });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.isOpen, userId, period]);

  // The current card's object URL is revoked on unmount; a replaced card is
  // already revoked above, as soon as its successor is ready.
  useEffect(() => {
    if (!card) return;
    const { url } = card;
    return () => URL.revokeObjectURL(url);
  }, [card]);

  const ready = card?.period === period ? card : null;
  const activeError = error?.period === period ? error.message : null;
  const activeLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "";

  function download() {
    if (!ready) return;
    downloadBlob(ready.blob, `betabook-${period}-recap.png`);
    setStatus("Downloaded");
  }

  async function share() {
    if (!ready) return;
    const file = new File([ready.blob], `betabook-${period}-recap.png`, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await openShareSheet({ files: [file], title: `${name}'s Betabook recap` });
        setStatus("");
      } else {
        download();
      }
    } catch {
      setError({ period, message: "Couldn't open sharing. Download it instead." });
    }
  }

  return (
    <AlertDialog.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <AlertDialog.Container placement="center" size="lg">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading>Share your stats</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body className="flex flex-col gap-4">
            <SegmentedButtons value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
            <div className="flex min-h-72 items-center justify-center rounded-lg bg-surface-secondary p-3">
              {ready ? (
                // A same-tab blob: URL from the just-fetched PNG — next/image
                // can't optimize or proxy it, so a plain <img> is correct here.
                // oxlint-disable-next-line next/no-img-element
                <img
                  src={ready.url}
                  alt={`${activeLabel} recap card preview`}
                  className="max-h-[55vh] w-auto rounded-md shadow-sm"
                />
              ) : (
                <p role="status" className="text-sm text-muted">
                  {activeError ? "" : "Generating…"}
                </p>
              )}
            </div>
            <p role="status" className="text-sm text-muted empty:sr-only">
              {status}
            </p>
            {activeError && <InlineAlert>{activeError}</InlineAlert>}
          </AlertDialog.Body>
          <AlertDialog.Footer className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onPress={state.close}>
              Close
            </Button>
            <Button variant="outline" onPress={download} isDisabled={!ready || isPending}>
              <Download aria-hidden="true" className="size-4" />
              Download
            </Button>
            {nativeShare && (
              <Button onPress={share} isDisabled={!ready || isPending}>
                <Share aria-hidden="true" className="size-4" />
                Share
              </Button>
            )}
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
