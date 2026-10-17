"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Share2 } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { ShareLinkField } from "@/components/ui/share-link-field";
import { SITE_NAME } from "@/lib/site";

/** Share button and dialog for a trip. The link is the profile share link
 * pointed at the trip, so it also opens the rest of the profile, and resetting
 * the profile link disables it. `url` is null if the profile is private. */
export function TripShare({ tripName, url }: { tripName: string; url: string | null }) {
  const state = useOverlayState();

  return (
    <>
      {/* Icon only on phones, to leave room for the trip name. */}
      <Button
        variant="ghost"
        size="sm"
        aria-label="Share"
        className="max-sm:size-8 max-sm:min-w-0 max-sm:p-0"
        onPress={state.open}
      >
        <Share2 aria-hidden="true" className="size-4" />
        <span className="max-sm:hidden">Share</span>
      </Button>

      <ResponsiveDialog state={state} title="Share trip" size="md">
        {url ? (
          <ShareLinkField
            label="Trip link"
            url={url}
            shareTitle={`${tripName} on ${SITE_NAME}`}
            description="Anyone with this link can see this trip and the rest of your profile. It uses your profile link, so resetting that link turns this one off."
            actions={
              <AppLink href="/account#profile" className="self-center text-sm underline">
                Reset link in Account settings
              </AppLink>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm">Sharing is off while your profile is private.</p>
            <AppLink href="/account#privacy" className="self-start text-sm underline">
              Change privacy settings
            </AppLink>
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}
