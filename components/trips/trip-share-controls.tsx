"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Share2 } from "lucide-react";

import { ShareTripDialog, type TripShare } from "@/components/trips/share-trip-dialog";
import { useMounted } from "@/hooks/use-mounted";
import { localToday } from "@/lib/format-date";
import { describeShareExpiry, isShareExpired } from "@/lib/share-expiry";

/** The Share control in a trip's header, and the chip that says whether a link
 * is live.
 *
 * `today` is resolved on the client only: the server has no reader timezone,
 * and a date that disagreed across the hydration boundary would be a mismatch.
 * Until it resolves the link reads as live — unknown clock, so the card does
 * not claim an expiry it cannot yet judge. */
export function TripShareControls({
  tripId,
  tripName,
  share,
  shareOrigin,
}: {
  tripId: number;
  tripName: string;
  share: TripShare;
  shareOrigin: string;
}) {
  const state = useOverlayState();
  const mounted = useMounted();
  const today = mounted ? localToday() : null;
  const liveShare = share && !isShareExpired(share.expiresAt, today) ? share : null;

  return (
    <div className="flex shrink-0 items-center gap-3">
      {liveShare && (
        <span className="text-sm text-muted">{describeShareExpiry(liveShare.expiresAt)}</span>
      )}
      <Button variant="ghost" size="sm" onPress={state.open}>
        <Share2 className="size-4" />
        {liveShare ? "Shared" : "Share"}
      </Button>

      {/* Not mounted until the clock is known: the dialog seeds its state from
       * `share` on mount, so opening it while `today` is still null would bake
       * in an expired link and offer to copy it. */}
      {today != null && (
        <ShareTripDialog
          state={state}
          tripId={tripId}
          tripName={tripName}
          share={liveShare}
          shareOrigin={shareOrigin}
        />
      )}
    </div>
  );
}
