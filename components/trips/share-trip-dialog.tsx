"use client";

import { Button, useOverlayState, type UseOverlayStateReturn } from "@heroui/react";
import { useId, useState, useTransition } from "react";

import { shareTrip, unshareTrip } from "@/actions";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OptionSelect } from "@/components/ui/option-select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { ShareLinkField } from "@/components/ui/share-link-field";
import {
  DEFAULT_SHARE_EXPIRY,
  SHARE_EXPIRIES,
  describeShareExpiry,
  type ShareExpiry,
} from "@/lib/share-expiry";
import { SITE_NAME } from "@/lib/site";
import { tripSharePath } from "@/lib/trip-share";

const EXPIRY_OPTIONS = SHARE_EXPIRIES.map(({ value, label }) => ({ value, label }));

export type TripShare = { token: string; expiresAt: string | null } | null;

/** Publishes one trip behind a link, and says plainly what that link is before
 * it exists. A short form, so by the overlay rule it is a ResponsiveDialog — a
 * sheet on a phone, a centered column from `md` up.
 *
 * There is no audience control, deliberately. A link cannot enforce who holds
 * it, and offering Friends or Members here would borrow the words the journal
 * audience uses for something it does not mean: that setting decides who sees
 * an entry in a feed, this one only decides whether a URL still answers.
 *
 * The copy is one sentence, matching the profile and project share controls.
 * The page shows this trip as the climber's own tabs show it — overriding
 * their journal and send-comment audiences for the entries inside the window —
 * so "sessions, notes and sends" has to keep covering exact dates, ratings,
 * grades and comments. Anything added to the payload needs this line changed
 * first. The dialog title already names the trip. */
export function ShareTripDialog({
  state,
  tripId,
  tripName,
  share,
  shareOrigin,
}: {
  state: UseOverlayStateReturn;
  tripId: number;
  tripName: string;
  /** The link as the server last saw it, or null when nothing is shared. */
  share: TripShare;
  /** The site's own origin, resolved on the server: a client-built origin
   * would differ between the render and the hydration on a preview domain. */
  shareOrigin: string;
}) {
  const [expiry, setExpiry] = useState<ShareExpiry>(DEFAULT_SHARE_EXPIRY);
  // The live link as the server last confirmed it, including the deadline it
  // computed — so the dialog reports the real expiry the moment it changes.
  const [link, setLink] = useState<TripShare>(share);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stopState = useOverlayState();
  const [stopError, setStopError] = useState<string | null>(null);
  const expiryLabelId = useId();

  function handleShare() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await shareTrip(tripId, expiry);
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
      const result = await unshareTrip(tripId);
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
        title={`Share ${tripName}`}
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
          <p className="text-sm">
            Anyone with the link sees this trip&apos;s sessions, notes and sends.
          </p>
          <p className="text-sm text-muted">Climbers you tagged aren&apos;t named.</p>

          <div className="flex items-center justify-between gap-3">
            {/* The control sets a duration; the line under the link below
             * reports the date it works out to. Naming both "Link expires"
             * read as the same thing said twice. */}
            <span id={expiryLabelId} className="text-sm font-medium">
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
              label="Trip link"
              url={`${shareOrigin}${tripSharePath(link.token)}`}
              shareTitle={`${tripName} on ${SITE_NAME}`}
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
        title={`Stop sharing ${tripName}?`}
        description="The link stops working for everyone you sent it to. Your sessions, notes and sends are kept, and you can share the trip again later with a new link."
        confirmLabel="Stop sharing"
        onConfirm={handleStop}
        isPending={pending}
        error={stopError}
      />
    </>
  );
}
