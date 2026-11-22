"use client";

import { shareTrip, unshareTrip } from "@/actions";
import { ShareLinkButton } from "@/components/share-link-button";
import type { ShareLink } from "@/components/share-link-dialog";
import { TRIP_SHARE_SENTENCE, tripSharePath } from "@/lib/trip-share";

/** Share button and dialog for one trip. The link is the trip's own, at
 * `/trips/{token}`; it opens nothing else on the profile. */
export function TripShare({
  tripId,
  tripName,
  share,
  shareOrigin,
  isPrivate,
}: {
  tripId: number;
  tripName: string;
  /** The live link as the server last saw it, or null when the trip isn't
   * shared or its link has expired (`getTripShareForOwner`). */
  share: ShareLink;
  /** The site's own origin, resolved on the server. */
  shareOrigin: string;
  isPrivate: boolean;
}) {
  return (
    <ShareLinkButton
      isPrivate={isPrivate}
      name={tripName}
      sentence={TRIP_SHARE_SENTENCE}
      linkLabel="Trip link"
      path={tripSharePath}
      share={share}
      shareOrigin={shareOrigin}
      onShare={(expiry) => shareTrip(tripId, expiry)}
      onUnshare={() => unshareTrip(tripId)}
      stopDescription="The link stops working for everyone you sent it to. The trip and everything logged on it are kept, and you can share it again later with a new link."
    />
  );
}
