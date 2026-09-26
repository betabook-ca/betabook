"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { shareTrip, unshareTrip } from "@/actions";
import { ShareLinkDialog, type ShareLink } from "@/components/share-link-dialog";
import { tripSharePath } from "@/lib/trip-share";

export type TripShare = ShareLink;

/** Publishes one trip behind a link. The sentence has to keep covering
 * everything the shared page shows — it overrides the owner's journal and
 * send-comment audiences for the entries inside the window, so "sessions,
 * notes and sends" means exact dates, ratings, grades and comments. Anything
 * added to the payload needs this line changed first. */
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
  return (
    <ShareLinkDialog
      state={state}
      name={tripName}
      sentence="Anyone with the link sees this trip's sessions, notes and sends."
      linkLabel="Trip link"
      path={tripSharePath}
      share={share}
      shareOrigin={shareOrigin}
      onShare={(expiry) => shareTrip(tripId, expiry)}
      onUnshare={() => unshareTrip(tripId)}
      stopDescription="The link stops working for everyone you sent it to. Your sessions, notes and sends are kept, and you can share the trip again later with a new link."
    />
  );
}
