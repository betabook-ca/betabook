"use client";

import { ShareLinkButton } from "@/components/share-link-button";
import type { ShareLink } from "@/components/share-link-dialog";
import { CLIMB_LIST_SHARE_SENTENCE, climbListSharePath } from "@/lib/climb-lists";
import { shareClimbList, unshareClimbList } from "@/spa/lib/actions-client";

/** Share button and dialog for one list. The link is the list's own, at
 * `/lists/{token}`, and opens it whatever the owner's lists setting says. */
export function ClimbListShare({
  listId,
  listTitle,
  share,
  shareOrigin,
  isPrivate,
}: {
  listId: number;
  listTitle: string;
  /** The live link, or null when the list isn't shared or its link expired
   * (`getClimbListShareForOwner`). */
  share: ShareLink;
  /** The site's own origin, resolved on the server. */
  shareOrigin: string;
  isPrivate: boolean;
}) {
  return (
    <ShareLinkButton
      isPrivate={isPrivate}
      name={listTitle}
      sentence={CLIMB_LIST_SHARE_SENTENCE}
      linkLabel="List link"
      path={climbListSharePath}
      share={share}
      shareOrigin={shareOrigin}
      onShare={(expiry) => shareClimbList(listId, expiry)}
      onUnshare={() => unshareClimbList(listId)}
      showTaggedNote={false}
      stopDescription="The link stops working for everyone you sent it to. The list and its climbs are kept, and you can share it again later with a new link."
    />
  );
}
