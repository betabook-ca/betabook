"use client";

import { Button, Description, Input, Label, TextField, useOverlayState } from "@heroui/react";
import { Copy, Download, RotateCcw, Share } from "lucide-react";
import { useState, useTransition } from "react";

import { resetProfileShareLink } from "@/actions";
import { AppLink } from "@/components/ui/app-link";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { QrCode } from "@/components/ui/qr-code";
import { openShareSheet, useNativeShare } from "@/hooks/use-native-share";
import { downloadBlob, pngBlob } from "@/lib/download";
import { qrMatrix, qrPixels } from "@/lib/qr-code";
import { SITE_NAME } from "@/lib/site";

/** `url` is null while the profile is private. */
export function ShareProfileControls({ name, url }: { name: string; url: string | null }) {
  const nativeShare = useNativeShare();
  const resetState = useOverlayState();
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!url) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">Sharing is off while your profile is private.</p>
        <AppLink href="#privacy" className="self-start text-sm underline">
          Change privacy settings
        </AppLink>
      </div>
    );
  }
  const link = url;

  function report(nextStatus: string, nextError: string | null = null) {
    setStatus(nextStatus);
    setError(nextError);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      report("Link copied");
    } catch {
      report("", "Couldn't copy the link. Select it and copy it instead.");
    }
  }

  async function share() {
    try {
      await openShareSheet({ title: `${name} on ${SITE_NAME}`, url: link });
      report("");
    } catch {
      report("", "Couldn't open sharing. Copy the link instead.");
    }
  }

  async function download() {
    try {
      const { data, width } = qrPixels(qrMatrix(link), 12);
      downloadBlob(await pngBlob(new ImageData(data, width, width)), "betabook-profile-qr.png");
      report("");
    } catch {
      report("", "Couldn't create the QR code image. Try again.");
    }
  }

  function reset() {
    setResetError(null);
    startTransition(async () => {
      try {
        const result = await resetProfileShareLink();
        if (!result.ok) {
          setResetError(result.error);
          return;
        }
        resetState.close();
        report("Link reset. Earlier links and QR codes no longer show your name.");
      } catch {
        setResetError("Couldn't reset the link. Try again.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <TextField value={link} isReadOnly>
            <Label>Profile link</Label>
            <Input onFocus={(event) => event.currentTarget.select()} />
            <Description className="text-sm">
              Anyone with the link sees your name, photo, send stats and latest sends.
            </Description>
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
            <Button variant="ghost" onPress={resetState.open}>
              <RotateCcw aria-hidden="true" className="size-4" />
              Reset link
            </Button>
          </div>
          <p role="status" className="text-sm text-muted empty:sr-only">
            {status}
          </p>
          {error && <InlineAlert>{error}</InlineAlert>}
        </div>
        <div className="flex flex-col items-center gap-2 self-center sm:self-start">
          <QrCode value={link} label="QR code for your profile link" className="size-40" />
          <Button variant="ghost" size="sm" onPress={download}>
            <Download aria-hidden="true" className="size-4" />
            Download QR code
          </Button>
        </div>
      </div>
      <ConfirmDeleteDialog
        state={resetState}
        noun="link"
        title="Reset your profile link?"
        description="Links and QR codes you've already shared will stop showing your name."
        confirmLabel="Reset link"
        onConfirm={reset}
        isPending={isPending}
        error={resetError}
      />
    </>
  );
}
