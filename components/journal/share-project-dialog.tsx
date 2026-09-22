"use client";

import { Button, useOverlayState, type UseOverlayStateReturn } from "@heroui/react";
import { useId, useState, useTransition } from "react";

import { shareProject, unshareProject } from "@/actions";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OptionSelect } from "@/components/ui/option-select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { ShareLinkField } from "@/components/ui/share-link-field";
import type { PinnedProject } from "@/db/queries";
import {
  DEFAULT_PROJECT_SHARE_EXPIRY,
  describeProjectShare,
  PROJECT_SHARE_EXPIRIES,
  projectSharePath,
  type ProjectShareExpiry,
} from "@/lib/project-share";
import { SITE_NAME } from "@/lib/site";

const EXPIRY_OPTIONS = PROJECT_SHARE_EXPIRIES.map(({ value, label }) => ({ value, label }));

type ShareProjectDialogProps = {
  state: UseOverlayStateReturn;
  climbId: number;
  climbName: string;
  /** The link as the server last saw it, or null when nothing is shared. */
  share: PinnedProject["share"];
  /** The site's own origin, resolved on the server: a client-built origin
   * would differ between the render and the hydration on a preview domain. */
  shareOrigin: string;
};

/** Publishes one project behind a link, and says plainly what that link is
 * before it exists. A short form, so by the overlay rule it is a
 * ResponsiveDialog — a sheet on a phone, a centered column from `md` up, and
 * not fullscreen, which is reserved for forms taller than 85vh.
 *
 * There is no audience control, deliberately. A link cannot enforce who holds
 * it, and offering Friends or Members here would borrow the words the journal
 * audience uses for something it does not mean: that setting decides who sees
 * an entry in a feed, this one only decides whether a URL still answers.
 * Someone reading "Friends" on a URL would reasonably conclude it was safe to
 * forward. So the dialog says the true thing instead, and spends its controls
 * on the two that are real — how long the link lasts, and stopping it. */
export function ShareProjectDialog({
  state,
  climbId,
  climbName,
  share,
  shareOrigin,
}: ShareProjectDialogProps) {
  const [expiry, setExpiry] = useState<ProjectShareExpiry>(DEFAULT_PROJECT_SHARE_EXPIRY);
  // The live link as the server last confirmed it, including the deadline it
  // computed — so the dialog reports the real expiry the moment it changes
  // rather than after a round trip through the board.
  const [link, setLink] = useState<PinnedProject["share"]>(share);
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
      const result = await shareProject(climbId, expiry);
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
      const result = await unshareProject(climbId);
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
    setExpiry(DEFAULT_PROJECT_SHARE_EXPIRY);
    setLink(share);
    setNotice("");
    setError(null);
    setStopError(null);
  }

  return (
    <>
      <ResponsiveDialog
        state={state}
        title={`Share ${climbName}`}
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
          {/* Said before the link exists, not after. Two things a climber is
           * least likely to expect: that the notes travel with it, and that
           * the link does not care who is holding it. */}
          <p className="text-sm">
            Anyone with this link can open it, and pass it on. They see your sessions and notes for{" "}
            {climbName}.
          </p>
          <p className="text-sm text-muted">
            Nothing else is shared, and it doesn&apos;t appear in anyone&apos;s feed.
          </p>

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
              label="Project link"
              url={`${shareOrigin}${projectSharePath(link.token)}`}
              shareTitle={`${climbName} on ${SITE_NAME}`}
              description={describeProjectShare(link.expiresAt)}
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
        title={`Stop sharing ${climbName}?`}
        description="The link stops working for everyone you sent it to. Your sessions, notes and send are kept, and you can share it again later with a new link."
        confirmLabel="Stop sharing"
        onConfirm={handleStop}
        isPending={pending}
        error={stopError}
      />
    </>
  );
}
