"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Download, QrCode as QrCodeIcon, RotateCcw } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { resetProfileShareLink } from "@/actions";
import { AppLink } from "@/components/ui/app-link";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { QrCode } from "@/components/ui/qr-code";
import { ShareLinkField } from "@/components/ui/share-link-field";
import { downloadBlob, pngBlob } from "@/lib/download";
import { qrMatrix, qrPixels } from "@/lib/qr-code";
import { SITE_NAME } from "@/lib/site";

/** `url` is null while the profile is private. */
export function ShareProfileControls({ name, url }: { name: string; url: string | null }) {
  const resetState = useOverlayState();
  const [error, setError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();
  const [qrOpen, setQrOpen] = useState(false);
  const qrId = useId();

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

  async function download() {
    try {
      const { data, width } = qrPixels(qrMatrix(link), 12);
      downloadBlob(await pngBlob(new ImageData(data, width, width)), "betabook-profile-qr.png");
      setError(null);
    } catch {
      setError("Couldn't create the QR code image. Try again.");
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
        setStatus("Link reset.");
      } catch {
        setResetError("Couldn't reset the link. Try again.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <ShareLinkField
            label="Profile link"
            url={link}
            shareTitle={`${name} on ${SITE_NAME}`}
            description="Anyone with the link sees your name, photo, send stats and latest sends."
            notice={status}
            error={error}
            actions={
              <Button variant="ghost" onPress={resetState.open}>
                <RotateCcw aria-hidden="true" className="size-4" />
                Reset link
              </Button>
            }
          />
        </div>
        <div className="flex w-full flex-col gap-2 self-start sm:w-auto">
          <Button
            variant="ghost"
            className="min-h-11 self-start sm:hidden"
            aria-expanded={qrOpen}
            aria-controls={qrId}
            onPress={() => setQrOpen(!qrOpen)}
          >
            <QrCodeIcon aria-hidden className="size-5" />
            {qrOpen ? "Hide QR code" : "Show QR code"}
          </Button>
          <div
            id={qrId}
            className={`${qrOpen ? "flex" : "hidden sm:flex"} flex-col items-center gap-2 self-center sm:self-start`}
          >
            <QrCode value={link} label="QR code for your profile link" className="size-40" />
            <Button variant="ghost" size="sm" onPress={download}>
              <Download aria-hidden="true" className="size-4" />
              Download QR code
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDeleteDialog
        state={resetState}
        noun="link"
        title="Reset your profile link?"
        description="Links and QR codes you've already shared will stop working."
        confirmLabel="Reset link"
        onConfirm={reset}
        isPending={isPending}
        error={resetError}
      />
    </>
  );
}
