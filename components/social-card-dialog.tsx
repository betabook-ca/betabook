"use client";

import { AlertDialog, Button } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { Copy, Download, Share } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { prepareRecapShare } from "@/actions";
import { AppLink } from "@/components/ui/app-link";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useMounted } from "@/hooks/use-mounted";
import { openShareSheet, useNativeShare } from "@/hooks/use-native-share";
import { downloadBlob } from "@/lib/download";
import { isMobileDevice } from "@/lib/mobile-detection";
import { fetchRecapCoverImage, fetchStatsCardImage } from "@/lib/social-card-fetch";

/** A generated card, kept alongside the blob URL that renders it so both can
 * be revoked/replaced together instead of drifting out of sync. */
type Card = { blob: Blob; url: string; sharePath: string | null };
type CardError = {
  kind: "generation" | "share" | "copy";
  message: string;
};

/** Put the recap link on its own line so the image and message stay easy to
 * scan in the native app picker. Use the page origin so local HTTPS shares do
 * not point to localhost on the recipient's phone. */
function shareText(sharePath: string | null): string {
  const caption = "View my climbing progress";
  return sharePath ? `${caption}\n${new URL(sharePath, window.location.origin).href}` : caption;
}

function canShareFile(file: File): boolean {
  try {
    return navigator.canShare?.({ files: [file] }) ?? false;
  } catch {
    return false;
  }
}

function getShareControls(
  mobile: boolean,
  nativeShare: boolean,
  ready: Card | null,
  year: number,
  shareFailed: boolean,
) {
  const shareFile =
    nativeShare && ready
      ? new File([ready.blob], `betabook-${year}-year-in-review.png`, { type: "image/png" })
      : null;
  // Keep the share control stable while the card loads, then check whether
  // the browser can actually share its PNG file.
  const canShareImage = nativeShare && (shareFile === null || canShareFile(shareFile));
  return {
    shareFile,
    canShareImage,
    showDownload: !canShareImage || (ready !== null && shareFailed),
    showShareButton: mobile && (canShareImage || !nativeShare),
    shareUnavailableMessage:
      mobile && !canShareImage
        ? !window.isSecureContext
          ? "Open this page over HTTPS to choose an app. For now, download the card and share it from Photos or Files."
          : "This browser can't share images to apps. Download the card and share it from Photos or Files."
        : null,
  };
}

// oxlint-disable-next-line complexity -- coordinates independent preview, copy, download and native-share paths
export function SocialCardDialog({
  state,
  userId,
  name,
  year = 2026,
  linkedRecapAvailable = false,
}: {
  state: UseOverlayStateReturn;
  userId: string;
  name: string;
  year?: number;
  linkedRecapAvailable?: boolean;
}) {
  const mounted = useMounted();
  const mobile = mounted && isMobileDevice();
  const nativeShare = useNativeShare();
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<CardError | null>(null);
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!state.isOpen) return;
    let cancelled = false;
    startTransition(async () => {
      try {
        const prepared = linkedRecapAvailable ? await prepareRecapShare() : null;
        if (prepared && !prepared.ok) {
          if (!cancelled) setError({ kind: "generation", message: prepared.error });
          return;
        }
        const blob = prepared
          ? await fetchRecapCoverImage(prepared.value.token)
          : await fetchStatsCardImage(userId, "year");
        if (cancelled) return;
        // The object URL of whatever card this replaces is revoked by the
        // cleanup on the effect below, keyed off the same `card` state.
        setCard({
          blob,
          url: URL.createObjectURL(blob),
          sharePath: prepared?.value.path ?? null,
        });
        setError(null);
        setStatus("");
      } catch {
        if (!cancelled)
          setError({
            kind: "generation",
            message: "Couldn't generate your card. Try again.",
          });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.isOpen, userId, linkedRecapAvailable]);

  // Revoke the current card URL when it is replaced, closed or unmounted.
  useEffect(() => {
    if (!card) return;
    const { url } = card;
    return () => URL.revokeObjectURL(url);
  }, [card]);

  const ready = card;
  const activeError = error;
  const { shareFile, canShareImage, showDownload, showShareButton, shareUnavailableMessage } =
    getShareControls(mobile, nativeShare, ready, year, activeError?.kind === "share");

  function download() {
    if (!ready) return;
    downloadBlob(ready.blob, `betabook-${year}-year-in-review.png`);
    setError(null);
    setStatus("Downloaded");
  }

  async function copyRecapLink() {
    if (!ready?.sharePath) return;
    try {
      await navigator.clipboard.writeText(new URL(ready.sharePath, window.location.origin).href);
      setError(null);
      setStatus("Recap link copied");
    } catch {
      setError({
        kind: "copy",
        message: "Couldn't copy the recap link. Open the preview to copy its URL.",
      });
    }
  }

  async function share() {
    if (!ready || !shareFile) return;
    try {
      if (canShareFile(shareFile)) {
        await openShareSheet({
          files: [shareFile],
          title: `${name}'s ${year} Betabook year in review`,
          text: shareText(ready.sharePath),
        });
        setError(null);
        setStatus("");
      } else {
        download();
      }
    } catch {
      setError({ kind: "share", message: "Couldn't open sharing. Download it instead." });
    }
  }

  function onOpenChange(open: boolean) {
    if (!open) {
      setCard(null);
      setError(null);
      setStatus("");
    }
    state.setOpen(open);
  }

  return (
    <AlertDialog.Backdrop isOpen={state.isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Container placement="center" size="lg">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading>{year} Year in review</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body className="flex flex-col gap-4">
            <div className="flex min-h-72 items-center justify-center rounded-lg bg-surface-secondary p-3">
              {ready ? (
                // A same-tab blob: URL from the just-fetched PNG — next/image
                // can't optimize or proxy it, so a plain <img> is correct here.
                // oxlint-disable-next-line next/no-img-element
                <img
                  src={ready.url}
                  alt={`${year} Year in review card preview`}
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
            {ready?.sharePath && (
              <div className="flex flex-col gap-1 text-sm">
                <AppLink href={ready.sharePath} target="_blank" rel="noopener noreferrer">
                  Preview all recap pages
                </AppLink>
                <p className="text-muted">
                  Anyone with the link can see your frozen breakthroughs, Analytics highlights, and
                  favorite climbs while your profile is public.
                </p>
              </div>
            )}
            {shareUnavailableMessage && (
              <p className="text-sm text-muted">{shareUnavailableMessage}</p>
            )}
            {activeError && <InlineAlert>{activeError.message}</InlineAlert>}
          </AlertDialog.Body>
          <AlertDialog.Footer className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onPress={() => onOpenChange(false)}>
              Close
            </Button>
            {showDownload && (
              <Button variant="outline" onPress={download} isDisabled={!ready || isPending}>
                <Download aria-hidden="true" className="size-4" />
                Download
              </Button>
            )}
            {ready?.sharePath && (
              <Button variant="outline" onPress={copyRecapLink} isDisabled={isPending}>
                <Copy aria-hidden="true" className="size-4" />
                Copy recap link
              </Button>
            )}
            {showShareButton && (
              <Button onPress={share} isDisabled={!canShareImage || !ready || isPending}>
                <Share aria-hidden="true" className="size-4" />
                Share to app
              </Button>
            )}
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
