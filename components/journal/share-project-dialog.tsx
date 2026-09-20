"use client";

import { Button, useOverlayState, type UseOverlayStateReturn } from "@heroui/react";
import { useId, useState, useTransition } from "react";

import { shareProject, unshareProject } from "@/actions";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OptionSelect } from "@/components/ui/option-select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { ShareLinkField } from "@/components/ui/share-link-field";
import type { PinnedProject } from "@/db/queries";
import { PROJECT_SHARE_AUDIENCES, type ProjectShareAudience } from "@/lib/privacy";
import {
  DEFAULT_PROJECT_SHARE_EXPIRY,
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

/** Publishes one project behind a link, and says plainly what that link shows
 * before it exists. A picker with two controls, so by the overlay rule it is a
 * ResponsiveDialog — a sheet on a phone, a centered column from `md` up, and
 * not fullscreen, which is reserved for forms taller than 85vh.
 *
 * The audience is a segmented control rather than a dropdown: there are three
 * options, the difference between them is the whole decision, and the app's
 * settings dropdowns are for a standing default rather than a choice made per
 * link. The expiry is a dropdown because one of its four values is the answer
 * and the others are just durations. */
export function ShareProjectDialog({
  state,
  climbId,
  climbName,
  share,
  shareOrigin,
}: ShareProjectDialogProps) {
  const [audience, setAudience] = useState<ProjectShareAudience>(share?.audience ?? "friends");
  const [expiry, setExpiry] = useState<ProjectShareExpiry>(DEFAULT_PROJECT_SHARE_EXPIRY);
  const [token, setToken] = useState<string | null>(share?.token ?? null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stopState = useOverlayState();
  const [stopError, setStopError] = useState<string | null>(null);
  const audienceLabelId = useId();
  const expiryLabelId = useId();

  function handleShare() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await shareProject(climbId, audience, expiry);
      if (!result.ok) {
        // Stay open: the climber can fix the reason, or copy the old link.
        setError(result.error);
        return;
      }
      setToken(result.value.token);
      setNotice(token ? "Link updated." : "Link created.");
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
      setToken(null);
      setNotice("Sharing stopped.");
    });
  }

  function reset() {
    setAudience(share?.audience ?? "friends");
    setExpiry(DEFAULT_PROJECT_SHARE_EXPIRY);
    setToken(share?.token ?? null);
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
            {token && (
              <Button variant="ghost" isDisabled={pending} onPress={stopState.open}>
                Stop sharing
              </Button>
            )}
            <Button isDisabled={pending} onPress={handleShare}>
              {token ? "Save changes" : "Create link"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span id={audienceLabelId} className="text-sm font-medium">
              Who can open this link
            </span>
            {/* SegmentedButtons renders a plain button group, so the choice
             * needs a group to hang the question off for a screen reader. */}
            <div role="group" aria-labelledby={audienceLabelId}>
              <SegmentedButtons
                value={audience}
                onChange={setAudience}
                options={PROJECT_SHARE_AUDIENCES}
                isDisabled={pending}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span id={expiryLabelId} className="text-sm font-medium">
              Link expires
            </span>
            <OptionSelect
              ariaLabel="Link expires"
              value={expiry}
              onChange={setExpiry}
              options={EXPIRY_OPTIONS}
              className="w-36"
            />
          </div>

          {/* Said before the link exists, not after. The notes are the part a
           * climber is least likely to expect to be publishing. */}
          <p className="text-sm text-muted">
            Anyone who can open this link sees your sessions and notes for {climbName}, and whether
            you have sent it. The rest of your journal, your other projects and your other climbs
            stay private.
          </p>

          {token ? (
            <ShareLinkField
              label="Project link"
              url={`${shareOrigin}${projectSharePath(token)}`}
              shareTitle={`${climbName} on ${SITE_NAME}`}
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

          {token && (
            <p className="text-sm text-muted">
              Saving keeps the same link, so anything you have already sent goes on working — it
              applies the audience above and starts the expiry again from now.
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
