"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { ShareLinkDialog } from "@/components/sharing/share-link-dialog";
import type { PinnedProject } from "@/lib/logbook-types";
import { projectSharePath } from "@/lib/project-share";
import { shareProject, unshareProject } from "@/spa/lib/actions-client";

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

/** Publishes one tracked project behind a link. The sentence has to keep
 * covering everything the shared page shows — it overrides the owner's
 * journal and send-comment audiences for this climb, so "send" means its
 * date, rating, grade and comment. Anything added to the payload needs this
 * line changed first. */
export function ShareProjectDialog({
  state,
  climbId,
  climbName,
  share,
  shareOrigin,
}: ShareProjectDialogProps) {
  return (
    <ShareLinkDialog
      state={state}
      name={climbName}
      sentence="Anyone with the link sees your sessions, notes and send."
      linkLabel="Project link"
      path={projectSharePath}
      share={share}
      shareOrigin={shareOrigin}
      onShare={(expiry) => shareProject(climbId, expiry)}
      onUnshare={() => unshareProject(climbId)}
      stopDescription="The link stops working for everyone you sent it to. Your sessions, notes and send are kept, and you can share it again later with a new link."
    />
  );
}
