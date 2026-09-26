"use client";

import { Button, useOverlayState, type UseOverlayStateReturn } from "@heroui/react";
import { useState, useTransition } from "react";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OptionSelect } from "@/components/ui/option-select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { ShareLinkField } from "@/components/ui/share-link-field";
import type { ActionResult } from "@/lib/action-result";
import {
  DEFAULT_SHARE_EXPIRY,
  SHARE_EXPIRIES,
  describeShareExpiry,
  type ShareExpiry,
} from "@/lib/share-expiry";
import { SITE_NAME } from "@/lib/site";

const EXPIRY_OPTIONS = SHARE_EXPIRIES.map(({ value, label }) => ({ value, label }));

/** A link as the server last saw it, or null when nothing is shared. */
export type ShareLink = { token: string; expiresAt: string | null } | null;

type ShareLinkDialogProps = {
  state: UseOverlayStateReturn;
  /** What is being shared. It names the dialog and the share sheet, so the
   * body never repeats it. */
  name: string;
  /** What the link discloses, said before one exists. */
  sentence: string;
  linkLabel: string;
  path: (token: string) => string;
  share: ShareLink;
  /** The site's own origin, resolved on the server: a client-built origin
   * would differ between the render and the hydration on a preview domain. */
  shareOrigin: string;
  onShare: (expiry: ShareExpiry) => Promise<ActionResult<NonNullable<ShareLink>>>;
  onUnshare: () => Promise<ActionResult>;
  /** What survives stopping: the confirmation exists to say it is not a
   * delete. */
  stopDescription: string;
};

/** Publishes one thing behind a link, and says plainly what that link is
 * before it exists.
 *
 * No audience control, deliberately. A link cannot enforce who holds it, and
 * offering Friends or Members would borrow the journal audience's words for
 * something that only decides whether a URL still answers. */
export function ShareLinkDialog({
  state,
  name,
  sentence,
  linkLabel,
  path,
  share,
  shareOrigin,
  onShare,
  onUnshare,
  stopDescription,
}: ShareLinkDialogProps) {
  const [expiry, setExpiry] = useState<ShareExpiry>(DEFAULT_SHARE_EXPIRY);
  // The deadline the server computed, shown without waiting for a refresh.
  const [link, setLink] = useState<ShareLink>(share);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stopState = useOverlayState();
  const [stopError, setStopError] = useState<string | null>(null);

  function handleShare() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await onShare(expiry);
      if (!result.ok) {
        // Stay open: the climber can fix the reason, or copy the old link.
        setError(result.error);
        return;
      }
      setNotice(link ? "Link renewed." : "Link created.");
      setLink(result.value);
    });
  }

  function handleStop() {
    setStopError(null);
    startTransition(async () => {
      const result = await onUnshare();
      if (!result.ok) {
        setStopError(result.error);
        return;
      }
      stopState.close();
      setLink(null);
      setNotice("Sharing stopped.");
    });
  }

  function reset() {
    setExpiry(DEFAULT_SHARE_EXPIRY);
    setLink(share);
    setNotice("");
    setError(null);
    setStopError(null);
  }

  return (
    <>
      <ResponsiveDialog
        state={state}
        title={`Share ${name}`}
        size="md"
        isPending={pending}
        onClose={reset}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            {link && (
              <Button variant="ghost" isDisabled={pending} onPress={stopState.open}>
                Stop sharing
              </Button>
            )}
            <Button isDisabled={pending} onPress={handleShare}>
              {link ? "Renew link" : "Create link"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">{sentence}</p>
          <p className="text-sm text-muted">Climbers you tagged aren&apos;t named.</p>

          <div className="flex items-center justify-between gap-3">
            {/* The control sets a duration; the line under the link reports
             * the date it works out to, so neither is called "Link expires".
             * The select names itself, so the visible label stays out of the
             * accessibility tree rather than being read twice. */}
            <span aria-hidden className="text-sm font-medium">
              Expires after
            </span>
            <OptionSelect
              ariaLabel="Expires after"
              value={expiry}
              onChange={setExpiry}
              options={EXPIRY_OPTIONS}
              className="w-36"
            />
          </div>

          {link ? (
            <ShareLinkField
              label={linkLabel}
              url={`${shareOrigin}${path(link.token)}`}
              shareTitle={`${name} on ${SITE_NAME}`}
              description={describeShareExpiry(link.expiresAt)}
              notice={notice}
              error={error}
            />
          ) : (
            <>
              <p role="status" className="text-sm text-muted empty:sr-only">
                {notice}
              </p>
              {error && <InlineAlert>{error}</InlineAlert>}
            </>
          )}

          {link && (
            <p className="text-sm text-muted">
              Renewing keeps the same link, so anything you have already sent goes on working — it
              starts the expiry again from now.
            </p>
          )}
        </div>
      </ResponsiveDialog>

      <ConfirmDeleteDialog
        state={stopState}
        noun="link"
        title={`Stop sharing ${name}?`}
        description={stopDescription}
        confirmLabel="Stop sharing"
        onConfirm={handleStop}
        isPending={pending}
        error={stopError}
      />
    </>
  );
}
