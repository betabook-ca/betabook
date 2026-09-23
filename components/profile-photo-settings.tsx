"use client";

import { Button, useOverlayState } from "@heroui/react";
import { ImagePlus } from "lucide-react";
import { useState, useTransition } from "react";
import { FileTrigger } from "react-aria-components";

import { uploadProfilePhoto } from "@/actions";
import { ProfilePhotoCropper } from "@/components/profile-photo-cropper";
import { RemoveProfilePhotoButton } from "@/components/remove-profile-photo-button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SettingsRow } from "@/components/ui/settings";
import type { CropSquare } from "@/lib/photo-canvas";
import { ACCEPTED_PROFILE_PHOTO_TYPES, sourcePhotoProblem } from "@/lib/profile-photo";
import { getAvatarPhoto } from "@/lib/user-initials";

const PROFILE_PHOTO_UPLOAD_FAILED_MESSAGE =
  "Couldn't save your photo. Check your connection and try again.";

const DESCRIPTION = {
  none: "Upload one and crop it to a square — it shows on your profile, in the feed and to your friends.",
  uploaded: "Upload a new one to replace it, or remove it to show your initials instead.",
  google:
    "From your Google account. Upload your own to replace it, or remove it to show your initials.",
} as const;

/** The Profile photo row: choose a photo, frame it, and it replaces whatever
 * was there. */
export function ProfilePhotoSettings({
  image,
  cropSquare,
}: {
  image?: string | null;
  /** Forwarded to the cropper for jsdom; see ProfilePhotoCropper. */
  cropSquare?: CropSquare;
}) {
  const cropperState = useOverlayState();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const photo = getAvatarPhoto(image);
  const kind = photo === null ? "none" : photo.optimize ? "google" : "uploaded";

  function handleSelect(files: FileList | null) {
    const chosen = files?.item(0);
    if (!chosen) return;

    // The picker's own limits, not the action's: what gets uploaded is the
    // cropped square, so a big phone photo is welcome here.
    const problem = sourcePhotoProblem(chosen);
    setError(problem);
    if (problem) return;

    setFile(chosen);
    cropperState.open();
  }

  function handleCropped(photoFile: File) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await uploadProfilePhoto(withPhoto(photoFile));
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // The row re-renders from the server with the new photo; closing
        // first keeps the cropper from outliving the file it framed.
        cropperState.close();
        setFile(null);
      } catch {
        setError(PROFILE_PHOTO_UPLOAD_FAILED_MESSAGE);
      }
    });
  }

  return (
    <SettingsRow title="Profile photo" description={DESCRIPTION[kind]}>
      <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <FileTrigger
            acceptedFileTypes={[...ACCEPTED_PROFILE_PHOTO_TYPES]}
            onSelect={handleSelect}
          >
            <Button variant="outline" className="gap-2">
              <ImagePlus aria-hidden="true" className="size-4" />
              {photo === null ? "Upload photo" : "Change photo"}
            </Button>
          </FileTrigger>
          {photo !== null && <RemoveProfilePhotoButton />}
        </div>
        {/* Selection problems belong here rather than in the cropper: the
            cropper never opened. */}
        {error !== null && !cropperState.isOpen && <InlineAlert>{error}</InlineAlert>}
      </div>

      <ProfilePhotoCropper
        file={file}
        state={cropperState}
        onCropped={handleCropped}
        isPending={isPending}
        error={cropperState.isOpen ? error : null}
        cropSquare={cropSquare}
      />
    </SettingsRow>
  );
}

function withPhoto(photo: File): FormData {
  const data = new FormData();
  data.set("photo", photo);
  return data;
}
