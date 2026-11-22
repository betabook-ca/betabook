"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Share2 } from "lucide-react";
import type { ComponentProps } from "react";

import { ShareLinkDialog } from "@/components/share-link-dialog";
import { AppLink } from "@/components/ui/app-link";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

type ShareLinkButtonProps = Omit<ComponentProps<typeof ShareLinkDialog>, "state"> & {
  /** A private profile can't share, so the dialog says so instead of
   * offering a link that would be refused. */
  isPrivate: boolean;
};

/** The Share button in a page header, and the dialog it opens. It reads
 * "Shared" while a link is live. Each feature passes its own copy and
 * actions; the button, the dialog and the private-profile notice are shared. */
export function ShareLinkButton({ isPrivate, ...dialog }: ShareLinkButtonProps) {
  const state = useOverlayState();
  const label = dialog.share ? "Shared" : "Share";

  return (
    <>
      {/* Icon only on phones, to leave room for the title beside it. */}
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
        <ResponsiveDialog state={state} title={`Share ${dialog.name}`} size="md">
          <div className="flex flex-col gap-2">
            <p className="text-sm">Sharing is off while your profile is private.</p>
            <AppLink href="/account#privacy" className="self-start text-sm underline">
              Change privacy settings
            </AppLink>
          </div>
        </ResponsiveDialog>
      ) : (
        <ShareLinkDialog state={state} {...dialog} />
      )}
    </>
  );
}
