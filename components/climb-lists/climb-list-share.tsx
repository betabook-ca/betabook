"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Share2 } from "lucide-react";

import { shareClimbList, unshareClimbList } from "@/actions";
import { ShareLinkDialog, type ShareLink } from "@/components/share-link-dialog";
import { AppLink } from "@/components/ui/app-link";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { CLIMB_LIST_SHARE_SENTENCE, climbListSharePath } from "@/lib/climb-lists";

/** Share button and dialog for one list. The link is the list's own, at
 * `/lists/{token}`, and opens it whatever the owner's lists setting says. A
 * private profile can't share, so the dialog says so instead. */
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
  const state = useOverlayState();
  const label = share ? "Shared" : "Share";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={label}
        className="max-sm:size-8 max-sm:min-w-0 max-sm:p-0"
        onPress={state.open}
      >
        <Share2 aria-hidden="true" className="size-4" />
        <span className="max-sm:hidden">{label}</span>
      </Button>

      {isPrivate ? (
        <ResponsiveDialog state={state} title={`Share ${listTitle}`} size="md">
          <div className="flex flex-col gap-2">
            <p className="text-sm">Sharing is off while your profile is private.</p>
            <AppLink href="/account#privacy" className="self-start text-sm underline">
              Change privacy settings
            </AppLink>
          </div>
        </ResponsiveDialog>
      ) : (
        <ShareLinkDialog
          state={state}
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
      )}
    </>
  );
}
