"use client";

import { Button, Label, Slider } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { RotateCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Area, Point } from "react-easy-crop";

import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cropToSquarePhoto, type CropSquare } from "@/lib/photo-canvas";
import { nextQuarterTurn, sameCropArea, type CropArea, type QuarterTurn } from "@/lib/photo-crop";

// Loaded when a photo is actually chosen: the cropper is the heaviest thing
// on /account, and nobody reading their settings should pay for it.
const Cropper = dynamic(() => import("react-easy-crop"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" rounded="rounded-panel" />,
});

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
export const CROP_FAILED_MESSAGE = "Couldn't prepare that photo. Try a different one.";

type ProfilePhotoCropperProps = {
  /** The photo just chosen. */
  file: File | null;
  state: UseOverlayStateReturn;
  /** Handed the square to upload. The drawer stays open until the upload
   * succeeds, so a failure can be shown against the photo it happened to. */
  onCropped: (photo: File) => void;
  isPending: boolean;
  /** Failure from the upload, shown alongside this drawer's own. */
  error?: string | null;
  /** Seam for jsdom, which has neither `OffscreenCanvas` nor
   * `createImageBitmap`. Production always uses the default. */
  cropSquare?: CropSquare;
};

/** Frames an uploaded photo as the square that gets stored. The crop window
 * is round because every avatar in the app is: what the climber lines up
 * here is exactly what the feed will show.
 *
 * Cropping happens here rather than on the server so the upload is a ~60 KB
 * square instead of a phone photo, and so the framing is the climber's
 * decision rather than a guess about where the subject is. */
export function ProfilePhotoCropper({
  file,
  state,
  onCropped,
  isPending,
  error,
  cropSquare = cropToSquarePhoto,
}: ProfilePhotoCropperProps) {
  return (
    <ResponsiveDialog state={state} title="Crop your photo" isPending={isPending}>
      {file && (
        // Keyed by the photo so picking a different one starts fresh instead
        // of inheriting the last one's zoom and rotation. A remount is
        // simpler here than an effect that resets state.
        <CropFrame
          key={`${file.name}:${file.size}:${file.lastModified}`}
          file={file}
          onCancel={state.close}
          onCropped={onCropped}
          isPending={isPending}
          error={error ?? null}
          cropSquare={cropSquare}
        />
      )}
    </ResponsiveDialog>
  );
}

function CropFrame({
  file,
  onCancel,
  onCropped,
  isPending,
  error,
  cropSquare,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (photo: File) => void;
  isPending: boolean;
  error: string | null;
  cropSquare: CropSquare;
}) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [rotation, setRotation] = useState<QuarterTurn>(0);
  const [area, setArea] = useState<CropArea | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  // Encoding the square runs before the upload starts, so `isPending` alone
  // would leave a window in which pressing Use photo again begins a second
  // crop — and a second upload once each finishes.
  const [isCropping, setIsCropping] = useState(false);

  const source = useMemo(() => URL.createObjectURL(file), [file]);
  // A blob URL pins the whole photo in memory until it is revoked.
  useEffect(() => () => URL.revokeObjectURL(source), [source]);

  async function handleUse() {
    if (!area || isCropping) return;
    setCropError(null);
    setIsCropping(true);
    try {
      onCropped(await cropSquare(file, area, rotation));
    } catch (failure) {
      console.error("Cropping a profile photo failed", failure);
      setCropError(CROP_FAILED_MESSAGE);
    } finally {
      setIsCropping(false);
    }
  }

  const isBusy = isCropping || isPending;
  const shownError = cropError ?? error;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-pretty text-muted">
        Drag to move and zoom to fill the circle — avatars are round, so the circle is what everyone
        sees. Arrow keys nudge the photo.
      </p>

      {/* The frame is square, so its height follows its width. Capping the
       * width against the viewport height keeps a wide dialog from pushing
       * the buttons below the fold. */}
      <div className="relative mx-auto aspect-square w-full max-w-[min(100%,55vh)] overflow-hidden rounded-panel bg-accent">
        <Cropper
          image={source}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={1}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          zoomSpeed={1}
          cropShape="round"
          showGrid={false}
          restrictPosition
          keyboardStep={8}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          // Held by value, not by the object the cropper hands over: a
          // report that changed nothing must not re-render the drawer.
          onCropComplete={(_percent: Area, pixels: Area) =>
            setArea((current) =>
              current !== null && sameCropArea(current, pixels) ? current : pixels,
            )
          }
          style={{}}
          classes={{}}
          mediaProps={{ alt: "" }}
          // The crop window is a focusable div the cropper pans with the
          // arrow keys; a role is what makes its label legal, and `group` is
          // the honest one for a labelled region holding a custom gesture.
          cropperProps={{ role: "group", "aria-label": "Photo crop area" }}
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Slider
          className="min-w-40 flex-1"
          value={zoom}
          minValue={MIN_ZOOM}
          maxValue={MAX_ZOOM}
          step={0.05}
          onChange={(value) => setZoom(Array.isArray(value) ? value[0] : value)}
        >
          <Label>Zoom</Label>
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <Button
          variant="outline"
          className="gap-2"
          onPress={() => setRotation(nextQuarterTurn(rotation))}
        >
          <RotateCw aria-hidden="true" className="size-4" />
          Rotate
        </Button>
      </div>

      {shownError !== null && <InlineAlert>{shownError}</InlineAlert>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onPress={onCancel} isDisabled={isBusy}>
          Cancel
        </Button>
        <Button onPress={handleUse} isDisabled={isBusy || area === null}>
          {isBusy ? "Saving…" : "Use photo"}
        </Button>
      </div>
    </div>
  );
}
