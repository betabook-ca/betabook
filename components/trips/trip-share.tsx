"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Share2 } from "lucide-react";

import { shareTrip, unshareTrip } from "@/actions";
import { ShareLinkDialog, type ShareLink } from "@/components/share-link-dialog";
import { AppLink } from "@/components/ui/app-link";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { isShareExpired } from "@/lib/share-expiry";
import { TRIP_SHARE_SENTENCE, tripSharePath } from "@/lib/trip-share";

/** Share button and dialog for one trip. The link is the trip's own, at
 * `/trips/{token}`; it opens nothing else on the profile. A private profile
 * can't share, so the dialog says so instead of offering a link that would be
 * refused. */
export function TripShare({
  tripId,
  tripName,
  share,
  shareOrigin,
  isPrivate,
  today,
}: {
  tripId: number;
  tripName: string;
  /** The link as the server last saw it, or null when the trip isn't shared. */
  share: ShareLink;
  /** The site's own origin, resolved on the server. */
  shareOrigin: string;
  isPrivate: boolean;
  /** Today as `YYYY-MM-DD`, resolved on the server, so the button can't read
   * differently in the render and the hydration. */
  today: string;
}) {
  const state = useOverlayState();
  // An expired link is still in the dialog, to renew, but the trip isn't shared.
  const live = share !== null && !isShareExpired(share.expiresAt, today);
  const label = live ? "Shared" : "Share";

  return (
    <>
      {/* Icon only on phones, to leave room for the trip name. */}
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
        <ResponsiveDialog state={state} title={`Share ${tripName}`} size="md">
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
      )}
    </>
  );
}
