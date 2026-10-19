"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Share2 } from "lucide-react";

import { shareTrip, unshareTrip } from "@/actions";
import { ShareLinkDialog, type ShareLink } from "@/components/share-link-dialog";
import { TRIP_SHARE_SENTENCE, tripSharePath } from "@/lib/trip-share";

/** Share button and dialog for one trip. The link is the trip's own, at
 * `/trips/{token}`; it opens nothing else on the profile. */
export function TripShare({
  tripId,
  tripName,
  share,
  shareOrigin,
}: {
  tripId: number;
  tripName: string;
  /** The link as the server last saw it, or null when the trip isn't shared. */
  share: ShareLink;
  /** The site's own origin, resolved on the server. */
  shareOrigin: string;
}) {
  const state = useOverlayState();

  return (
    <>
      {/* Icon only on phones, to leave room for the trip name. */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={share ? "Shared" : "Share"}
        className="max-sm:size-8 max-sm:min-w-0 max-sm:p-0"
        onPress={state.open}
      >
        <Share2 aria-hidden="true" className="size-4" />
        <span className="max-sm:hidden">{share ? "Shared" : "Share"}</span>
      </Button>

      <ShareLinkDialog
        state={state}
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
    </>
  );
}
