"use client";

import { Switch } from "@heroui/react";
import { useId, useState, useTransition } from "react";

import { setShowProfilePhoto } from "@/actions";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SETTINGS_ROW_CLASS } from "@/components/ui/settings";
import { UserAvatar } from "@/components/ui/user-avatar";

/** Shown only to accounts that actually have a photo to hide — see
 * hasProfilePhoto in lib/profile-photo.ts. The avatar beside the switch is the
 * preview: it follows local state, so the result is visible before the server
 * action's refresh() reaches the surrounding server components. */
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
      <div className="flex items-center gap-3">
        <UserAvatar name={name} image={showPhoto ? image : null} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Switch
            isDisabled={isPending}
            isSelected={showPhoto}
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
          <p id={descriptionId} className="text-sm text-pretty text-muted">
            {showPhoto
              ? "Your Google photo appears anywhere you show up. Turn this off to use your initials instead."
              : "Your initials appear anywhere you show up. Your photo is kept, so you can turn this back on."}
          </p>
        </div>
      </div>
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
