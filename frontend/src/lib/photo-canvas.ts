import {
  PROFILE_PHOTO_UPLOAD_PIXELS,
  PROFILE_PHOTO_UPLOAD_QUALITY,
  rotationPlacement,
  squareCropArea,
  type CropArea,
  type QuarterTurn,
} from "@/lib/photo-crop";

/** The one browser-API step in the picker: turn the framed square into the
 * file that gets uploaded. Isolated in its own module so the cropper
 * component can be tested in jsdom, which has neither `OffscreenCanvas` nor
 * `createImageBitmap`, by passing a stand-in for `cropToSquarePhoto`.
 *
 * Every browser in the project's baseline (see package.json) has both APIs
 * and WebP encoding, so there is no fallback path to keep alive here. */

export type CropSquare = (source: Blob, area: CropArea, rotation: QuarterTurn) => Promise<File>;

const CROPPED_PHOTO_FILENAME = "profile-photo.webp";

export const cropToSquarePhoto: CropSquare = async (source, area, rotation) => {
  // `from-image` applies EXIF orientation, which is also what the cropper's
  // <img> did on screen. Without it a photo taken sideways on a phone crops
  // the way the climber framed it and then lands rotated.
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });

  try {
    const placement = rotationPlacement({ width: bitmap.width, height: bitmap.height }, rotation);
    const turned = new OffscreenCanvas(placement.canvas.width, placement.canvas.height);
    const turnedContext = turned.getContext("2d");
    if (!turnedContext) throw new Error("Canvas 2D context unavailable");

    turnedContext.translate(placement.centre.x, placement.centre.y);
    turnedContext.rotate(placement.radians);
    turnedContext.drawImage(bitmap, placement.offset.x, placement.offset.y);

    const crop = squareCropArea(area, placement.canvas);
    const square = new OffscreenCanvas(PROFILE_PHOTO_UPLOAD_PIXELS, PROFILE_PHOTO_UPLOAD_PIXELS);
    const squareContext = square.getContext("2d");
    if (!squareContext) throw new Error("Canvas 2D context unavailable");

    squareContext.drawImage(
      turned,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      PROFILE_PHOTO_UPLOAD_PIXELS,
      PROFILE_PHOTO_UPLOAD_PIXELS,
    );

    const blob = await square.convertToBlob({
      type: "image/webp",
      quality: PROFILE_PHOTO_UPLOAD_QUALITY,
    });
    return new File([blob], CROPPED_PHOTO_FILENAME, { type: "image/webp" });
  } finally {
    bitmap.close();
  }
};
