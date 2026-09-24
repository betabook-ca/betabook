"use client";

import { Button, useOverlayState, type UseOverlayStateReturn } from "@heroui/react";
import { useState, useTransition } from "react";

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

/** No audience control: a link can't enforce who holds it, so offering
 * Friends or Members would imply it is safe to forward. */
export function ShareProjectDialog({
  state,
  climbId,
  climbName,
  share,
  shareOrigin,
}: ShareProjectDialogProps) {
  const [expiry, setExpiry] = useState<ProjectShareExpiry>(DEFAULT_PROJECT_SHARE_EXPIRY);
  // The server's deadline, shown without waiting for the board to refresh.
  const [link, setLink] = useState<PinnedProject["share"]>(share);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stopState = useOverlayState();
  const [stopError, setStopError] = useState<string | null>(null);

  function handleShare() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await shareProject(climbId, expiry);
      if (!result.ok) {
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
          {/* The shared page overrides journal and comment audiences for this
           * climb, so "send" covers its date, rating, grade and comment. */}
          <p className="text-sm">Anyone with the link sees your sessions, notes and send.</p>
          <p className="text-sm text-muted">Climbers you tagged aren&apos;t named.</p>

          <div className="flex items-center justify-between gap-3">
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
