"use client";

import { Switch } from "@heroui/react";
import { useId, useState, useTransition } from "react";

import { setShowProfilePhoto } from "@/actions";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SETTINGS_ROW_CLASS } from "@/components/ui/settings";
import { UserAvatar } from "@/components/ui/user-avatar";
import { hasProfilePhoto } from "@/lib/profile-photo";

/** The row is shown to every account, but only one with a photo the app can
 * render has anything to turn off — see hasProfilePhoto. Without one the switch
 * is disabled and explains itself rather than disappearing, so the setting
 * doesn't look missing to someone who signed up with an email address.
 *
 * The avatar beside the switch is the preview: it follows local state, so the
 * result is visible before the server action's refresh() reaches the
 * surrounding server components. */
export function ProfilePhotoToggle({
  name,
  image,
  initialShowPhoto,
}: {
  name: string;
  /** The stored photo, not yet filtered by the setting. */
  image: string | null;
  initialShowPhoto: boolean;
}) {
  const [showPhoto, setShowPhoto] = useState(initialShowPhoto);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const descriptionId = useId();
  const canShowPhoto = hasProfilePhoto(image);
  // An account with no renderable photo reads as off whatever the column says:
  // there is nothing for the avatar to show, so a selected switch would lie.
  const isOn = canShowPhoto && showPhoto;

  function handleChange(next: boolean) {
    setShowPhoto(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await setShowProfilePhoto(next);
        if (!result.ok) {
          setShowPhoto(!next);
          setError(result.error);
        }
      } catch {
        setShowPhoto(!next);
        setError("Couldn't save your photo choice. Try again.");
      }
    });
  }

  return (
    <div className={`flex flex-col gap-3 ${SETTINGS_ROW_CLASS}`}>
      {/* Top-aligned: the description wraps to three lines on a phone, and a
          centered avatar then floats beside the middle of the paragraph. */}
      <div className="flex items-start gap-3">
        <UserAvatar name={name} image={isOn ? image : null} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Switch
            isDisabled={isPending || !canShowPhoto}
            isSelected={isOn}
            onChange={handleChange}
            aria-describedby={descriptionId}
          >
            <Switch.Content className="w-full justify-between gap-6">
              <span className="text-sm font-medium">Show profile photo</span>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
          {/* Outside Switch, like the privacy switch: a saving switch fades its
              own description below AA contrast. */}
          <div className="flex items-start gap-1">
            <p id={descriptionId} className="text-sm text-pretty text-muted">
              {!canShowPhoto
                ? "Your initials appear anywhere you show up."
                : isOn
                  ? "Your Google photo appears anywhere you show up. Turn this off to use your initials instead."
                  : "Your initials appear anywhere you show up. Your photo is kept, so you can turn this back on."}
            </p>
            {/* A disabled switch can't take focus, so the reason lives on a
                focusable button beside it rather than a tooltip on the switch. */}
            {!canShowPhoto && (
              <HelpTooltip label="Why can't I show a photo?">
                Betabook uses the photo from your Google account. Sign in with Google to show one —
                an email and password account always shows initials.
              </HelpTooltip>
            )}
          </div>
        </div>
      </div>
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
