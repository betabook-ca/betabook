"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Share2 } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { ShareLinkField } from "@/components/ui/share-link-field";
import { SITE_NAME } from "@/lib/site";

/** Hands someone one trip. There is one link, the profile's, and this is that
 * link opened on the trip: whoever holds it can open the rest of what it
 * shows, and resetting it closes this as well. `url` is null while the
 * profile is private. */
export function TripShare({ tripName, url }: { tripName: string; url: string | null }) {
  const state = useOverlayState();

  return (
    <>
      {/* A phone has room beside the trip's name for the icon and not the word. */}
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
            description="This is your profile link, opened on this trip. Anyone with it sees the trip's notes, photos and sends, and the rest of what your profile link shows."
            actions={
              <AppLink href="/account#profile" className="self-center text-sm underline">
                Reset it in Account settings
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
