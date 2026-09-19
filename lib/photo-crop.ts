/** Crop arithmetic for the profile photo picker, kept away from the canvas
 * so it can be tested without a browser. The cropper reports the square the
 * climber framed; this turns that into the region to copy out of the
 * (possibly rotated) source. */

/** The square the picker uploads: twice the 256 px the server stores, so the
 * downscale has real pixels to work with and a retina avatar stays crisp. */
export const PROFILE_PHOTO_UPLOAD_PIXELS = 512;

/** Quality of the WebP the picker uploads. Higher than the stored photo's,
 * because these bytes are re-encoded once more on the server. */
export const PROFILE_PHOTO_UPLOAD_QUALITY = 0.9;

/** Rotation is offered as a button, not a dial: quarter turns are what
 * fixes a sideways photo, they leave no empty corners to fill, and they
 * match the only rotations the Images binding itself accepts. */
export type QuarterTurn = 0 | 90 | 180 | 270;

export type PhotoSize = { width: number; height: number };
export type CropArea = { x: number; y: number; width: number; height: number };

const QUARTER_TURNS: QuarterTurn[] = [0, 90, 180, 270];

export function nextQuarterTurn(rotation: QuarterTurn): QuarterTurn {
  return QUARTER_TURNS[(QUARTER_TURNS.indexOf(rotation) + 1) % QUARTER_TURNS.length];
}

/** The size the photo occupies once turned — width and height swap on a
 * quarter turn, which is the frame the cropper's coordinates refer to. */
export function rotatedFrame(size: PhotoSize, rotation: QuarterTurn): PhotoSize {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { ...size };
}

/** How to place the unrotated photo on a canvas the size of its rotated
 * frame: rotate about the centre, then draw the photo centred on it. */
export function rotationPlacement(
  size: PhotoSize,
  rotation: QuarterTurn,
): {
  canvas: PhotoSize;
  centre: { x: number; y: number };
  offset: { x: number; y: number };
  radians: number;
} {
  const canvas = rotatedFrame(size, rotation);
  return {
    canvas,
    centre: { x: canvas.width / 2, y: canvas.height / 2 },
    offset: { x: -size.width / 2, y: -size.height / 2 },
    radians: (rotation * Math.PI) / 180,
  };
}

/** Whether two reported crops are the same region. The cropper hands back a
 * fresh object each time it reports, so storing one without this comparison
 * would re-render on a report that changed nothing. */
export function sameCropArea(a: CropArea, b: CropArea): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** The region to copy, as whole pixels inside the frame.
 *
 * The cropper is locked to a 1:1 aspect, but it reports fractional pixels
 * that rounding can leave a hair uneven or a hair outside the photo — and a
 * source rectangle that runs past the edge draws transparent padding into
 * the avatar. Squaring on the smaller side and clamping into the frame is
 * what keeps the uploaded photo a full square of real pixels. */
export function squareCropArea(area: CropArea, frame: PhotoSize): CropArea {
  const size = Math.max(
    1,
    Math.min(Math.round(area.width), Math.round(area.height), frame.width, frame.height),
  );
  const clamp = (value: number, limit: number) =>
    Math.max(0, Math.min(Math.round(value), limit - size));

  return {
    x: clamp(area.x, frame.width),
    y: clamp(area.y, frame.height),
    width: size,
    height: size,
  };
}
